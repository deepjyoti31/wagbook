import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, computeInvoice, stayLines, todayIn, toStayCharges, type InvoiceTotals, type LineInput } from "../../src/lib/core";
import { addMember, book, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { as, errorOf, createTestDb, user } from "./harness";

/**
 * What a stay costs when it is not every night at one price (stay_charges()):
 * a pet at the shared kennel price pays the usual price for nights it has the
 * kennel to itself, and day boarding that turns into boarding is billed as
 * days and then nights. Staff issue such a bill only as the database prices it.
 */

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

interface Row {
  booking_id: string;
  part: string;
  quantity: number;
  unit_price_minor: number;
  discount_minor: number;
}

async function charges(k: Kennel, ids: string[]): Promise<Row[]> {
  return as(db, user(k.owner), async () => {
    const r = await db.query<Row>("select * from public.stay_charges($1, $2)", [k.org, ids]);
    return r.rows.map((x) => ({ ...x, unit_price_minor: Number(x.unit_price_minor), discount_minor: Number(x.discount_minor) }));
  });
}

const brief = (rows: Row[]) => rows.map((r) => [r.part, r.quantity, r.unit_price_minor, r.discount_minor]);

/** Two siblings booked together in one kennel, the second at the shared price with the usual price for nights alone. */
async function shareKennel(k: Kennel, kennel: string, start: string, end: string, status = "confirmed", actor = k.owner) {
  return as(db, user(actor), async () => {
    const group = (await db.query<{ id: string }>("select gen_random_uuid() as id")).rows[0].id;
    const r = await db.query<{ id: string }>(
      `insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, kennel_id, rate_minor, alone_rate_minor, group_id)
       values ($1, $2, $3, 'boarding', $5, $6, $7, $8, 120000, null, $9), ($1, $2, $4, 'boarding', $5, $6, $7, $8, 90000, 120000, $9)
       returning id`,
      [k.org, k.client, k.pets[0], k.pets[1], status, start, end, kennel, group],
    );
    return { group, ids: r.rows.map((x) => x.id) };
  });
}

/** Save a draft bill as the app does and return its id. */
async function draft(k: Kennel, actor: string, t: InvoiceTotals, link: { booking?: string; group?: string }): Promise<string> {
  return as(db, user(actor), async () => {
    const r = await db.query<{ id: string }>("insert into public.invoices (org_id, client_id, booking_id, group_id) values ($1, $2, $3, $4) returning id", [
      k.org,
      k.client,
      link.booking ?? null,
      link.group ?? null,
    ]);
    const totals = {
      subtotal_minor: t.subtotalMinor, discount_minor: t.discountMinor, taxable_minor: t.taxableMinor, cgst_minor: t.cgstMinor, sgst_minor: t.sgstMinor,
      igst_minor: t.igstMinor, tax_minor: t.taxMinor, round_off_minor: t.roundOffMinor, total_minor: t.totalMinor,
    };
    const lines = t.lines.map((l, i) => ({
      sort_order: i, description: l.description, sac_code: l.sacCode, quantity: l.quantity, unit_price_minor: l.unitPriceMinor, discount_minor: l.discountMinor,
      taxable_minor: l.taxableMinor, tax_rate_bp: l.taxRateBp, cgst_minor: l.cgstMinor, sgst_minor: l.sgstMinor, igst_minor: l.igstMinor, tax_minor: l.taxMinor,
      total_minor: l.totalMinor,
    }));
    await db.query("select public.save_invoice_draft($1, $2, $3)", [r.rows[0].id, JSON.stringify(totals), JSON.stringify(lines)]);
    return r.rows[0].id;
  });
}

const issue = (actor: string, id: string) =>
  as(db, user(actor), async () => Number((await db.query<{ total_minor: string }>("select total_minor from public.issue_invoice($1)", [id])).rows[0].total_minor));

describe("a pet at the shared kennel price, left on its own", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 3, pets: 2 });
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
  });

  it("pays the shared price while its sibling is in the kennel, and the usual price after the sibling's stay is cut short", async () => {
    const f = await shareKennel(k, k.kennels[0], "2028-05-01", "2028-05-06");
    expect(brief(await charges(k, f.ids))).toEqual([
      ["stay", 5, 120000, 0],
      ["shared", 5, 90000, 0],
    ]);
    await as(db, user(manager), () => db.query("update public.bookings set end_date = '2028-05-04' where id = $1", [f.ids[0]]));
    expect(brief(await charges(k, [f.ids[1]]))).toEqual([
      ["shared", 3, 90000, 0],
      ["alone", 2, 120000, 0],
    ]);
  });

  it("counts a sibling checked out early only up to the day it went home", async () => {
    const today = todayIn("Asia/Kolkata");
    const f = await shareKennel(k, k.kennels[1], addDays(today, -3), addDays(today, 2), "checked_in");
    await as(db, user(staff), () => db.query("update public.bookings set status = 'checked_out' where id = $1", [f.ids[0]]));
    expect(brief(await charges(k, [f.ids[1]]))).toEqual([
      ["shared", 3, 90000, 0],
      ["alone", 2, 120000, 0],
    ]);
  });

  it("does not count a sibling that was cancelled, or that is in another kennel", async () => {
    const f = await shareKennel(k, k.kennels[2], "2028-06-01", "2028-06-03");
    await as(db, user(manager), () => db.query("update public.bookings set kennel_id = null where id = $1", [f.ids[0]]));
    expect(brief(await charges(k, [f.ids[1]]))).toEqual([["alone", 2, 120000, 0]]);
  });

  it("puts the discount on the largest line", async () => {
    const f = await shareKennel(k, k.kennels[2], "2028-07-01", "2028-07-06");
    await as(db, user(manager), () => db.query("update public.bookings set end_date = '2028-07-04' where id = $1", [f.ids[0]]));
    await as(db, user(manager), () => db.query("update public.bookings set discount_minor = 10000 where id = $1", [f.ids[1]]));
    // Three nights shared (2,700) against two alone (2,400).
    expect(brief(await charges(k, [f.ids[1]]))).toEqual([
      ["shared", 3, 90000, 10000],
      ["alone", 2, 120000, 0],
    ]);
  });

  it("lets staff issue the bill only with the nights alone at the usual price", async () => {
    const f = await shareKennel(k, k.kennels[0], "2028-08-01", "2028-08-06");
    await as(db, user(manager), () => db.query("update public.bookings set end_date = '2028-08-04' where id = $1", [f.ids[0]]));
    const stay = { kind: "boarding" as const, startDate: "2028-08-01", endDate: "2028-08-06" };
    const rows = await charges(k, f.ids);
    const lines: LineInput[] = f.ids.flatMap((id, i) =>
      stayLines({ ...stay, petName: `Dog ${i}`, rateMinor: 0, charges: toStayCharges(rows.filter((r) => r.booking_id === id)) }),
    );
    const allShared = computeInvoice(
      [...stayLines({ ...stay, endDate: "2028-08-04", petName: "Dog 0", rateMinor: 120000 }), ...stayLines({ ...stay, petName: "Dog 1", rateMinor: 90000 })],
      { mode: "none" },
    );
    const wrong = await draft(k, staff, allShared, { group: f.group });
    expect((await errorOf(() => issue(staff, wrong))).message).toContain("WB050");
    await as(db, user(k.owner), () => db.query("delete from public.invoices where id = $1", [wrong]));
    expect(await issue(staff, await draft(k, staff, computeInvoice(lines, { mode: "none" }), { group: f.group }))).toBe(3 * 120000 + 3 * 90000 + 2 * 120000);
  });

  it("lets only owners and managers change the price alone", async () => {
    const f = await shareKennel(k, k.kennels[1], "2028-09-01", "2028-09-03");
    const e = await errorOf(() => as(db, user(staff), () => db.query("update public.bookings set alone_rate_minor = 90000 where id = $1", [f.ids[1]])));
    expect(e.message).toContain("WB022");
    await as(db, user(manager), () => db.query("update public.bookings set alone_rate_minor = 100000 where id = $1", [f.ids[1]]));
  });
});

describe("day boarding that turns into boarding", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  let stay: string;
  const switchIt = (actor: string, id: string, from: string | null, dayRate: number | null, end = "2028-10-06") =>
    as(db, user(actor), () =>
      db.query("update public.bookings set kind = 'boarding', boarding_from = $2, day_rate_minor = $3, rate_minor = 120000, end_date = $4 where id = $1", [
        id,
        from,
        dayRate,
        end,
      ]),
    );

  beforeAll(async () => {
    k = await seedKennel(db, { kennels: 2, pets: 2 });
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
    stay = await book(db, k, { pet: k.pets[0], kind: "daycare", start: "2028-10-01", end: "2028-10-03", kennel: k.kennels[0], rate: 70000 });
  });

  it("refuses staff", async () => {
    expect((await errorOf(() => switchIt(staff, stay, "2028-10-03", 70000))).message).toContain("WB022");
  });

  it("needs a first night inside the stay, and a price for the days", async () => {
    for (const from of ["2028-10-01", "2028-10-06"]) {
      expect((await errorOf(() => switchIt(manager, stay, from, 70000))).message).toContain("bookings_boarding_from_inside_stay");
    }
    expect((await errorOf(() => switchIt(manager, stay, "2028-10-03", null))).message).toContain("bookings_day_part_has_a_price");
    const daycare = await errorOf(() =>
      as(db, user(manager), () => db.query("update public.bookings set boarding_from = '2028-10-02', day_rate_minor = 70000 where id = $1", [stay])),
    );
    expect(daycare.message).toContain("bookings_boarding_from_inside_stay");
  });

  it("bills the days of day boarding and then the nights, each at its price, and holds the kennel for the nights", async () => {
    await switchIt(manager, stay, "2028-10-03", 70000);
    expect(brief(await charges(k, [stay]))).toEqual([
      ["days", 2, 70000, 0],
      ["stay", 3, 120000, 0],
    ]);
    const other = await errorOf(async () => book(db, k, { pet: await strangerPet(db, k), start: "2028-10-05", end: "2028-10-07", kennel: k.kennels[0] }));
    expect(other.message).toContain("bookings_no_kennel_overlap");
  });

  it("lets staff issue the bill only as days and then nights", async () => {
    const base = { kind: "boarding" as const, petName: "Dog", startDate: "2028-10-01", endDate: "2028-10-06", rateMinor: 120000, boardingFrom: "2028-10-03" };
    const whole = await draft(k, staff, computeInvoice(stayLines(base), { mode: "none" }), { booking: stay });
    expect((await errorOf(() => issue(staff, whole))).message).toContain("WB050");
    await as(db, user(k.owner), () => db.query("delete from public.invoices where id = $1", [whole]));
    const lines = stayLines({ ...base, charges: toStayCharges(await charges(k, [stay])) });
    expect(lines.map((l) => l.description)).toEqual([
      "Day boarding: Dog, 2 days (1 Oct 2028 to 2 Oct 2028)",
      "Boarding: Dog, 3 nights (3 Oct 2028 to 6 Oct 2028)",
    ]);
    expect(await issue(staff, await draft(k, staff, computeInvoice(lines, { mode: "none" }), { booking: stay }))).toBe(2 * 70000 + 3 * 120000);
  });
});
