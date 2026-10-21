import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { billFor, seriesLines } from "../../src/lib/billing";
import { toStayCharges, type InvoiceTotals } from "../../src/lib/core";
import { addMember, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

/**
 * A repeating day boarding series is billed a month at a time (D41): every
 * day of the month that is not a request or cancelled, on one bill, one line
 * for each price. A day of a series is never billed on its own.
 */

let db: PGlite;
let k: Kennel;
let staff: string;
let manager: string;
const org = { tax_mode: "none" as const, gst_state_code: null, prices_include_tax: false, round_invoice_totals: true };

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 3, pets: 2 });
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  await as(db, user(k.owner), () =>
    db.query("insert into public.services (org_id, kind, name, unit, price_minor, is_default) values ($1, 'daycare', 'Day boarding', 'day', 72000, true)", [k.org]),
  );
});
afterAll(() => db.close());

/** A series of day boarding on these days, booked by staff at the price list's price. Returns its id and the days' ids. */
async function series(days: string[], pet = k.pets[0]): Promise<{ id: string; days: string[] }> {
  const id = crypto.randomUUID();
  const ids = await as(db, user(staff), async () =>
    (
      await db.query<{ id: string }>(
        `insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, rate_minor, series_id)
         select $1, p.client_id, p.id, 'daycare', 'confirmed', d::date, d::date, 72000, $3 from public.pets p, unnest($4::text[]) d where p.id = $2
         returning id`,
        [k.org, pet, id, days],
      )
    ).rows.map((r) => r.id),
  );
  return { id, days: ids };
}

/** The month's bill as the app builds it (stayBillLines), as `actor`. */
async function monthBill(seriesId: string, month: string, actor = staff): Promise<InvoiceTotals> {
  return as(db, user(actor), async () => {
    const days = (
      await db.query<{ id: string; kind: "daycare"; start_date: string; end_date: string; rate_minor: number; discount_minor: number; tax_rate_bp: number; sac_code: string | null; pass_id: string | null }>(
        `select id, kind, start_date::text, end_date::text, rate_minor::int, discount_minor::int, tax_rate_bp, sac_code, pass_id from public.bookings
         where series_id = $1 and start_date >= $2::date and start_date < ($2::date + interval '1 month') and status in ('confirmed', 'checked_in', 'checked_out', 'no_show')
         order by start_date`,
        [seriesId, month],
      )
    ).rows;
    const charges = (await db.query<{ booking_id: string; part: string; quantity: number; unit_price_minor: number; discount_minor: number }>(
      "select booking_id, part, quantity, unit_price_minor::int, discount_minor::int from public.stay_charges($1, $2)",
      [k.org, days.map((d) => d.id)],
    )).rows;
    const items = (await db.query<{ booking_id: string; description: string; quantity: number; unit_price_minor: number; tax_rate_bp: number; sac_code: string | null }>(
      "select booking_id, description, quantity::float, unit_price_minor::int, tax_rate_bp, sac_code from public.booking_items where booking_id = any ($1) order by created_at",
      [days.map((d) => d.id)],
    )).rows;
    return billFor(
      org,
      seriesLines("Tofu", month, days.map((d) => ({ booking: { ...d, charges: toStayCharges(charges.filter((c) => c.booking_id === d.id)) }, items: items.filter((i) => i.booking_id === d.id) }))),
    );
  });
}

/** Save a draft for the series' month with these totals, and issue it, as `actor`. */
async function issue(seriesId: string, month: string, t: InvoiceTotals, actor = staff): Promise<string> {
  return as(db, user(actor), async () => {
    const r = await db.query<{ id: string }>("insert into public.invoices (org_id, client_id, series_id, series_month) values ($1, $2, $3, $4) returning id", [k.org, k.client, seriesId, month]);
    const lines = t.lines.map((l, i) => ({
      sort_order: i, description: l.description, sac_code: l.sacCode, quantity: l.quantity, unit_price_minor: l.unitPriceMinor, discount_minor: l.discountMinor,
      taxable_minor: l.taxableMinor, tax_rate_bp: l.taxRateBp, cgst_minor: l.cgstMinor, sgst_minor: l.sgstMinor, igst_minor: l.igstMinor, tax_minor: l.taxMinor,
      total_minor: l.totalMinor,
    }));
    const totals = {
      subtotal_minor: t.subtotalMinor, discount_minor: t.discountMinor, taxable_minor: t.taxableMinor, cgst_minor: t.cgstMinor, sgst_minor: t.sgstMinor,
      igst_minor: t.igstMinor, tax_minor: t.taxMinor, round_off_minor: t.roundOffMinor, total_minor: t.totalMinor,
    };
    await db.query("select public.save_invoice_draft($1, $2, $3)", [r.rows[0].id, JSON.stringify(totals), JSON.stringify(lines)]);
    await db.query("select public.issue_invoice($1)", [r.rows[0].id]);
    return r.rows[0].id;
  });
}

describe("a month of a repeating series", () => {
  it("is billed on one bill, one line for each price, and staff can issue it", async () => {
    const s = await series(["2027-10-04", "2027-10-06", "2027-10-11", "2027-10-13", "2027-11-01"]);
    // One day is cancelled: it is not billed. One has a bath.
    await as(db, user(staff), async () => {
      await db.query("update public.bookings set status = 'cancelled', cancel_reason = 'Unwell' where id = $1", [s.days[1]]);
      await db.query("insert into public.booking_items (org_id, booking_id, description, quantity, unit_price_minor) values ($1, $2, 'Bath', 1, 50000)", [k.org, s.days[2]]);
    });
    const t = await monthBill(s.id, "2027-10-01");
    expect(t.lines.map((l) => [l.description, l.quantity, l.unitPriceMinor])).toEqual([
      ["Day boarding: Tofu, 3 days in October 2027 (4, 11, 13 Oct)", 3, 72000],
      ["11 Oct: Bath", 1, 50000],
    ]);
    expect(t.totalMinor).toBe(3 * 72000 + 50000);
    const id = await issue(s.id, "2027-10-01", t);
    expect(id).toBeTruthy();

    // A bill that leaves a day out is the manager's to issue, not staff's.
    const s2 = await series(["2027-12-06", "2027-12-08"]);
    const short = await monthBill(s2.id, "2027-12-01");
    const wrong = billFor(org, [{ ...short.lines[0], quantity: 1 }]);
    expect((await errorOf(() => issue(s2.id, "2027-12-01", wrong))).message).toContain("WB050");
  });

  it("has one live bill a month, and its days are never billed on their own", async () => {
    const s = await series(["2028-01-03", "2028-01-05"]);
    const t = await monthBill(s.id, "2028-01-01");
    await issue(s.id, "2028-01-01", t);
    expect((await errorOf(() => issue(s.id, "2028-01-01", t))).message).toContain("invoices_one_live_per_series_month");
    expect(
      (await errorOf(() => as(db, user(staff), () => db.query("insert into public.invoices (org_id, client_id, booking_id) values ($1, $2, $3)", [k.org, k.client, s.days[0]])))).message,
    ).toContain("WB055");
    // A month is named by its first day.
    expect(
      (await errorOf(() => as(db, user(staff), () => db.query("insert into public.invoices (org_id, client_id, series_id, series_month) values ($1, $2, $3, '2028-02-02')", [k.org, k.client, s.id])))).message,
    ).toContain("invoices_series_month");
  });

  it("names a series of the bill's own parent", async () => {
    const theirs = await series(["2028-03-06"], await strangerPet(db, k));
    expect(
      (await errorOf(() => as(db, user(staff), () => db.query("insert into public.invoices (org_id, client_id, series_id, series_month) values ($1, $2, $3, '2028-03-01')", [k.org, k.client, theirs.id])))).message,
    ).toContain("WB056");
  });

  it("takes in the advances paid for its days when it is issued", async () => {
    const s = await series(["2028-04-03", "2028-04-05"]);
    await as(db, user(staff), () =>
      db.query("insert into public.payments (org_id, client_id, booking_id, amount_minor, method, received_on) values ($1, $2, $3, 72000, 'cash', '2028-04-03')", [k.org, k.client, s.days[0]]),
    );
    const id = await issue(s.id, "2028-04-01", await monthBill(s.id, "2028-04-01"));
    const due = await as(db, user(staff), async () => Number((await db.query<{ due_minor: string }>("select due_minor from public.invoice_balances where invoice_id = $1", [id])).rows[0].due_minor));
    expect(due).toBe(72000);
  });

  it("keeps a billed day in its month", async () => {
    const s = await series(["2028-05-29", "2028-05-31"]);
    await issue(s.id, "2028-05-01", await monthBill(s.id, "2028-05-01"));
    // Within the month is a change of date the bill can be credited for; into June it would be billed twice.
    await as(db, user(manager), () => db.query("update public.bookings set start_date = '2028-05-30', end_date = '2028-05-30' where id = $1", [s.days[0]]));
    expect(
      (await errorOf(() => as(db, user(manager), () => db.query("update public.bookings set start_date = '2028-06-01', end_date = '2028-06-01' where id = $1", [s.days[1]])))).message,
    ).toContain("WB057");
  });
});
