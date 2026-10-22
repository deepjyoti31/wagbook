import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { createTestDb, errorOf } from "./harness";
import { dayFromToday, q } from "./kitchen-fixtures";

/**
 * Roadmap M38: credit. A refund kept as credit becomes the parent's credit,
 * ending after the kennel's months; it is spent on bills as a payment from
 * credit, the soonest to end first, never more than is left and never after it
 * ends; it moves no money in the reports.
 */

let db: PGlite;
let k: Kennel;
let staff: string;
let manager: string;
let stay: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 3 });
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  stay = await book(db, k, { pet: k.pets[0], start: await dayFromToday(db, k, 10), end: await dayFromToday(db, k, 13) });
});
afterAll(() => db.close());

const pay = (actor: string, o: { booking?: string; invoice?: string; direction: "in" | "out"; amount: number; method?: string; note?: string }) =>
  q<{ id: string }>(
    db, actor,
    `insert into public.payments (org_id, client_id, booking_id, invoice_id, direction, amount_minor, method, received_on, note)
     values ($1, $2, $3, $4, $5, $6, $7, current_date, $8) returning id`,
    [k.org, k.client, o.booking ?? null, o.invoice ?? null, o.direction, o.amount, o.method ?? "upi", o.note ?? null],
  );
const left = async () =>
  (await q<{ left: string | null }>(db, staff, "select sum(left_minor) filter (where spendable)::text as left from public.credit_balances where client_id = $1", [k.client]))[0].left;

describe("credit kept from a cancelled stay", () => {
  it("is a refund paid as credit, never more than the advance, ending after the kennel's months", async () => {
    await pay(staff, { booking: stay, direction: "in", amount: 360000 });
    await q(db, staff, "update public.bookings set status = 'cancelled', cancel_reason = 'Plans changed', cancel_asked_at = now() - interval '1 day' where id = $1", [stay]);
    await pay(manager, { booking: stay, direction: "out", amount: 120000 });
    const tooMuch = await errorOf(() => pay(manager, { booking: stay, direction: "out", amount: 240001, method: "credit" }));
    expect(tooMuch.message).toContain("WB122");
    await pay(manager, { booking: stay, direction: "out", amount: 240000, method: "credit", note: "Weekend nights kept as credit" });
    const [credit] = await q<{ kind: string; amount_minor: string; reason: string; months: number }>(
      db, staff,
      "select kind, amount_minor::text, reason, ((extract(year from age(expires_on, current_date)) * 12) + extract(month from age(expires_on, current_date)))::int as months from public.credits where client_id = $1",
      [k.client],
    );
    expect(credit).toEqual({ kind: "cancellation", amount_minor: "240000", reason: "Weekend nights kept as credit", months: 12 });
    expect(await left()).toBe("240000");
  });

  it("is refused to staff, who cannot pay out", async () => {
    const other = await book(db, k, { pet: k.pets[2], start: await dayFromToday(db, k, 40), end: await dayFromToday(db, k, 41) });
    await pay(staff, { booking: other, direction: "in", amount: 1000 });
    const e = await errorOf(() => pay(staff, { booking: other, direction: "out", amount: 100, method: "credit" }));
    expect(e.message).toContain("row-level security");
  });
});

describe("spending credit", () => {
  let later: string;

  beforeAll(async () => {
    later = await book(db, k, { pet: k.pets[1], start: await dayFromToday(db, k, 20), end: await dayFromToday(db, k, 21) });
  });

  it("takes from credit as a payment, never more than is left", async () => {
    await pay(staff, { booking: later, direction: "in", amount: 100000, method: "credit" });
    expect(await left()).toBe("140000");
    const e = await errorOf(() => pay(staff, { booking: later, direction: "in", amount: 140001, method: "credit" }));
    expect(e.message).toContain("WB211: there is only 140000 of credit left to spend");
  });

  it("takes the soonest to end first, and never what has ended", async () => {
    const [{ yesterday }] = await q<{ yesterday: string }>(db, manager, "select (current_date - 1)::text as yesterday");
    await q(db, manager, "insert into public.credits (org_id, client_id, kind, amount_minor, expires_on, reason) values ($1, $2, 'goodwill', 50000, $3, 'Sorry about the bath')", [k.org, k.client, await dayFromToday(db, k, 30)]);
    await q(db, manager, "insert into public.credits (org_id, client_id, kind, amount_minor, expires_on, reason) values ($1, $2, 'goodwill', 70000, $3, 'Ended')", [k.org, k.client, yesterday]);
    expect(await left()).toBe("190000");
    const [{ id }] = await pay(staff, { booking: later, direction: "in", amount: 60000, method: "credit" });
    const uses = await q<{ reason: string; amount_minor: string }>(
      db, staff,
      "select c.reason, u.amount_minor::text from public.credit_uses u join public.credits c on c.id = u.credit_id where u.payment_id = $1 order by c.expires_on",
      [id],
    );
    expect(uses).toEqual([{ reason: "Sorry about the bath", amount_minor: "50000" }, { reason: "Weekend nights kept as credit", amount_minor: "10000" }]);
  });

  it("is never changed, and comes back when its payment is removed", async () => {
    const [{ id }] = await q<{ id: string }>(db, staff, "select id from public.payments where method = 'credit' and direction = 'in' order by created_at desc limit 1");
    const e = await errorOf(() => q(db, manager, "update public.payments set amount_minor = 1 where id = $1", [id]));
    expect(e.message).toContain("WB212");
    const before = Number(await left());
    await q(db, k.owner, "delete from public.payments where id = $1", [id]);
    expect(Number(await left())).toBe(before + 60000);
  });

  it("is given as goodwill only by owners and managers, and kept from a cancellation only through a refund", async () => {
    const staffGives = await errorOf(() => q(db, staff, "insert into public.credits (org_id, client_id, kind, amount_minor, expires_on, reason) values ($1, $2, 'goodwill', 100, current_date + 30, 'x')", [k.org, k.client]));
    expect(staffGives.message).toContain("row-level security");
    const forged = await errorOf(() => q(db, manager, "insert into public.credits (org_id, client_id, kind, amount_minor, expires_on, reason) values ($1, $2, 'cancellation', 100, current_date + 30, 'x')", [k.org, k.client]));
    expect(forged.message).toMatch(/row-level security|WB213|credits_cancellation_from_a_payment/);
  });

  it("moves no money in the month's report", async () => {
    const [{ received, refunded }] = await q<{ received: string; refunded: string }>(
      db, manager,
      "select sum(received_minor)::text as received, sum(refunded_minor)::text as refunded from public.report_money($1, current_date - 31, current_date + 31)",
      [k.org],
    );
    expect([received, refunded]).toEqual(["361000", "120000"]);
  });
});
