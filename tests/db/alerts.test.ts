import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookingLines } from "../../src/lib/billing";
import { issueBill, totals } from "./appointment-fixtures";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { admin, anon, as, createTestDb, errorOf, user } from "./harness";
import { dayFromToday, q } from "./kitchen-fixtures";

/**
 * Roadmap M61: alerts on staff phones. The database writes an alert for a
 * parent's booking request, an incident, a pet gone home unpaid and the rest,
 * and wakes the phones of the people who chose that kind. Only the holder of
 * the installation's secret takes the phones to wake; a phone then reads,
 * signed in, what happened: a pet's name and a page, never a parent's
 * contact.
 */

let db: PGlite;
let k: Kennel;
let staff: string;
let manager: string;
let token: string;
const SECRET = "a-secret-the-app-is-given-of-forty-chars";

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  await as(db, admin, () => db.query("select public.set_push_secret($1)", [SECRET]));
  await q(db, k.owner, "insert into public.services (org_id, kind, name, unit, price_minor, is_default) values ($1, 'boarding', 'Boarding', 'night', 120000, true)", [k.org]);
  [{ token }] = await q<{ token: string }>(db, staff, "select public.renew_request_link($1) as token", [k.client]);
  // The manager wants booking requests and incidents on one phone; staff only incidents.
  for (const kind of ["booking_request", "incident", "unpaid_checkout"]) await q(db, manager, "insert into public.alert_choices (org_id, user_id, kind) values ($1, $2, $3)", [k.org, manager, kind]);
  await q(db, staff, "insert into public.alert_choices (org_id, user_id, kind) values ($1, $2, 'incident')", [k.org, staff]);
  await q(db, manager, "insert into public.push_subscriptions (org_id, user_id, endpoint) values ($1, $2, 'https://push.example.test/manager')", [k.org, manager]);
  await q(db, staff, "insert into public.push_subscriptions (org_id, user_id, endpoint) values ($1, $2, 'https://push.example.test/staff')", [k.org, staff]);
});
afterAll(() => db.close());

const take = (secret: string | null = SECRET, gone: string[] | null = null) =>
  as(db, anon, async () => (await db.query<{ endpoint: string }>("select endpoint from public.take_pushes($1, $2)", [secret, gone])).rows.map((r) => r.endpoint).sort());
const mine = (actor: string) => q<{ kind: string; pet_name: string | null; link: string; kennel: string }>(db, actor, "select kind, pet_name, link, kennel from public.my_alerts()");

describe("alerts on staff phones (M61)", () => {
  it("wakes the phones that chose a booking request from a parent, once, for the holder of the secret", async () => {
    const [from, to] = [await dayFromToday(db, k, 5), await dayFromToday(db, k, 7)];
    await as(db, anon, () => db.query("select public.submit_booking_request($1, $2)", [token, JSON.stringify({ kind: "boarding", pet_ids: [k.pets[0]], start_date: from, end_date: to })]));
    expect((await errorOf(() => take("wrong".repeat(10)))).message).toContain("WB277");
    expect((await errorOf(() => take(null))).message).toContain("WB277");
    expect(await take()).toEqual(["https://push.example.test/manager"]);
    expect(await take()).toEqual([]);

    const seen = await mine(manager);
    expect(seen).toHaveLength(1);
    expect(seen[0]).toMatchObject({ kind: "booking_request", pet_name: "Dog 1-1", kennel: expect.stringMatching(/^Test Kennel/) });
    expect(seen[0].link).toMatch(/^\/app\/bookings\/[0-9a-f-]{36}$/);
    // Staff did not choose booking requests.
    expect(await mine(staff)).toEqual([]);
  });

  it("wakes everyone who chose incidents, and names the pet but no parent's contact", async () => {
    await q(db, staff, "insert into public.incidents (org_id, pet_id, category, severity, description) values ($1, $2, 'injury', 'medium', 'A small cut on the paw')", [k.org, k.pets[1]]);
    expect(await take()).toEqual(["https://push.example.test/manager", "https://push.example.test/staff"]);
    const all = await q(db, manager, "select * from public.alerts");
    expect(JSON.stringify(all)).not.toMatch(/\+91|Parent \d/);
    expect((await mine(staff)).map((a) => a.kind)).toEqual(["incident"]);
  });

  it("alerts when a pet goes home with its bill unpaid, and not when it is paid", async () => {
    const unpaid = await book(db, k, { pet: k.pets[2], start: "2027-04-14", end: "2027-04-17", kennel: k.kennels[0] });
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [unpaid]);
    await q(db, staff, "update public.bookings set status = 'checked_out' where id = $1", [unpaid]);
    expect(await take()).toEqual(["https://push.example.test/manager"]);

    const paid = await book(db, k, { pet: k.pets[1], start: "2027-05-14", end: "2027-05-16", kennel: k.kennels[1] });
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [paid]);
    const [b] = await q<{ kind: "boarding"; start_date: string; end_date: string; rate_minor: number; discount_minor: number; tax_rate_bp: number; sac_code: null }>(
      db, staff, "select kind, start_date::text, end_date::text, rate_minor::int, discount_minor::int, tax_rate_bp, sac_code from public.bookings where id = $1", [paid]);
    const t = totals(bookingLines("Dog", b, []));
    const bill = await issueBill(db, staff, k, { booking: paid }, t);
    await q(db, staff, "insert into public.payments (org_id, client_id, invoice_id, amount_minor, method, received_on) values ($1, $2, $3, $4, 'cash', '2027-05-16')", [k.org, k.client, bill, t.totalMinor]);
    await q(db, staff, "update public.bookings set status = 'checked_out' where id = $1", [paid]);
    expect(await take()).toEqual([]);
  });

  it("lets each person choose only their own alerts and phones, and read their kennel's alerts only", async () => {
    expect((await errorOf(() => q(db, staff, "insert into public.alert_choices (org_id, user_id, kind) values ($1, $2, 'food_order')", [k.org, manager]))).message).toMatch(/row-level security/);
    expect((await errorOf(() => q(db, staff, "insert into public.push_subscriptions (org_id, user_id, endpoint) values ($1, $2, 'https://push.example.test/x')", [k.org, manager]))).message).toMatch(/row-level security/);
    expect(await q(db, staff, "select endpoint from public.push_subscriptions")).toEqual([{ endpoint: "https://push.example.test/staff" }]);
    expect((await errorOf(() => q(db, staff, "insert into public.alerts (org_id, kind, link) values ($1, 'incident', '/app')", [k.org]))).message).toMatch(/permission denied/);
    expect((await errorOf(() => q(db, manager, "select * from public.push_outbox"))).message).toMatch(/permission denied/);
    expect((await errorOf(() => as(db, anon, () => db.query("select * from public.alerts")))).message).toMatch(/permission denied/);
    const other = await seedKennel(db);
    expect(await q(db, other.owner, "select * from public.alerts")).toEqual([]);
    expect((await errorOf(() => as(db, user(staff), () => db.query("select public.set_push_secret($1)", [SECRET])))).message).toMatch(/permission denied/);
  });

  it("forgets a phone the push service says is gone", async () => {
    await q(db, staff, "insert into public.incidents (org_id, pet_id, category, severity, description) values ($1, $2, 'other', 'low', 'Ate a sock')", [k.org, k.pets[0]]);
    await take(SECRET, ["https://push.example.test/staff"]);
    expect(await q(db, staff, "select endpoint from public.push_subscriptions")).toEqual([]);
  });
});
