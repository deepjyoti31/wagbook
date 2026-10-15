import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeInvoice, stayLines, type InvoiceTotals, type LineInput, type TaxContext } from "../../src/lib/core";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

let db: PGlite;
let k: Kennel;
let staff: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 6, pets: 3 });
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
});
afterAll(() => db.close());

/** The JSON the app sends to save_invoice_draft(). */
function payload(t: InvoiceTotals) {
  return {
    totals: {
      subtotal_minor: t.subtotalMinor, discount_minor: t.discountMinor, taxable_minor: t.taxableMinor, cgst_minor: t.cgstMinor,
      sgst_minor: t.sgstMinor, igst_minor: t.igstMinor, tax_minor: t.taxMinor, round_off_minor: t.roundOffMinor, total_minor: t.totalMinor,
    },
    lines: t.lines.map((l, i) => ({
      sort_order: i, description: l.description, sac_code: l.sacCode, quantity: l.quantity, unit_price_minor: l.unitPriceMinor,
      discount_minor: l.discountMinor, taxable_minor: l.taxableMinor, tax_rate_bp: l.taxRateBp, cgst_minor: l.cgstMinor,
      sgst_minor: l.sgstMinor, igst_minor: l.igstMinor, tax_minor: l.taxMinor, total_minor: l.totalMinor,
    })),
  };
}

/** Make a draft as the app does: insert an empty draft, then save its lines and totals in one go. */
async function makeDraft(actor: string, t: InvoiceTotals, opts: { booking?: string | null; placeOfSupply?: string | null } = {}): Promise<string> {
  return as(db, user(actor), async () => {
    const r = await db.query<{ id: string }>(
      "insert into public.invoices (org_id, client_id, booking_id, place_of_supply_state_code) values ($1, $2, $3, $4) returning id",
      [k.org, k.client, opts.booking ?? null, opts.placeOfSupply ?? null],
    );
    const p = payload(t);
    await db.query("select public.save_invoice_draft($1, $2, $3)", [r.rows[0].id, JSON.stringify(p.totals), JSON.stringify(p.lines)]);
    return r.rows[0].id;
  });
}

const issue = (actor: string, id: string) =>
  as(db, user(actor), async () => (await db.query<{ number: string; total_minor: string }>("select number, total_minor from public.issue_invoice($1)", [id])).rows[0]);

async function setTax(mode: "none" | "simple" | "gst_india", inclusive: boolean, round: boolean) {
  await as(db, user(k.owner), () =>
    db.query(
      `update public.organizations set tax_mode = $2::text::public.tax_mode, prices_include_tax = $3, round_invoice_totals = $4,
         tax_id = case when $2::text = 'gst_india' then '29ABCDE1234F1Z5' else tax_id end,
         gst_state_code = case when $2::text = 'gst_india' then '29' else gst_state_code end
       where id = $1`,
      [k.org, mode, inclusive, round],
    ),
  );
}

describe("TypeScript and the database agree on every awkward bill", () => {
  const awkward: LineInput[] = [
    { description: "Boarding, 3 nights", quantity: 3, unitPriceMinor: 120000, taxRateBp: 1800 },
    { description: "Odd paise", quantity: 7, unitPriceMinor: 33333, discountMinor: 1, taxRateBp: 1800 },
    { description: "Half an hour", quantity: 1.5, unitPriceMinor: 99999, taxRateBp: 1200 },
    { description: "Discounted", quantity: 2, unitPriceMinor: 72000, discountMinor: 14399, taxRateBp: 500 },
    { description: "Zero rate", quantity: 1, unitPriceMinor: 50001, taxRateBp: 0 },
    { description: "High rate", quantity: 1, unitPriceMinor: 199, taxRateBp: 2800 },
    { description: "Free", quantity: 1, unitPriceMinor: 0, taxRateBp: 1800 },
  ];
  const cases: { name: string; mode: "none" | "simple" | "gst_india"; inclusive: boolean; round: boolean; interState?: boolean }[] = [
    { name: "no tax, rounded", mode: "none", inclusive: false, round: true },
    { name: "no tax, exact", mode: "none", inclusive: false, round: false },
    { name: "one tax on top", mode: "simple", inclusive: false, round: true },
    { name: "one tax inside the price", mode: "simple", inclusive: true, round: false },
    { name: "GST on top, same state", mode: "gst_india", inclusive: false, round: true },
    { name: "GST inside the price, same state", mode: "gst_india", inclusive: true, round: true },
    { name: "GST on top, other state", mode: "gst_india", inclusive: false, round: false, interState: true },
    { name: "GST inside the price, other state", mode: "gst_india", inclusive: true, round: true, interState: true },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      await setTax(c.mode, c.inclusive, c.round);
      const ctx: TaxContext = {
        mode: c.mode,
        sellerStateCode: c.mode === "gst_india" ? "29" : null,
        placeOfSupplyStateCode: c.interState ? "27" : c.mode === "gst_india" ? "29" : null,
        pricesIncludeTax: c.inclusive,
      };
      for (const lines of [awkward, [awkward[0]], [awkward[1], awkward[5]]]) {
        const t = computeInvoice(lines, ctx, { roundToWholeUnit: c.round });
        const id = await makeDraft(k.owner, t, { placeOfSupply: c.interState ? "27" : null });
        const issued = await issue(k.owner, id);
        expect(Number(issued.total_minor)).toBe(t.totalMinor);
      }
    });
  }

  it("including the worked example in docs/06: three nights at 1,200 with 18% GST inside the price", async () => {
    await setTax("gst_india", true, true);
    const t = computeInvoice([{ description: "Boarding", quantity: 3, unitPriceMinor: 120000, taxRateBp: 1800 }], {
      mode: "gst_india", sellerStateCode: "29", pricesIncludeTax: true,
    }, { roundToWholeUnit: true });
    expect([t.taxableMinor, t.cgstMinor, t.sgstMinor, t.totalMinor]).toEqual([305084, 27458, 27458, 360000]);
    await issue(k.owner, await makeDraft(k.owner, t));
    await setTax("none", false, true);
  });
});

describe("a bill is what its booking says, unless a manager says otherwise", () => {
  let booking: string;
  let lines: LineInput[];
  beforeAll(async () => {
    await setTax("none", false, true);
    booking = await book(db, k, { pet: k.pets[0], start: "2028-03-01", end: "2028-03-04", kennel: k.kennels[0] });
    await as(db, user(k.owner), () =>
      db.query("insert into public.booking_items (org_id, booking_id, description, unit_price_minor, quantity) values ($1, $2, 'Grooming', 200000, 1)", [k.org, booking]),
    );
    lines = stayLines({
      kind: "boarding", petName: "Dog", startDate: "2028-03-01", endDate: "2028-03-04", rateMinor: 120000,
      addOns: [{ description: "Grooming", quantity: 1, unitPriceMinor: 200000 }],
    });
  });

  it("refuses staff an edited bill, a bill with a line missing, and a bill with no booking", async () => {
    const cheaper = computeInvoice([{ ...lines[0], unitPriceMinor: 100000 }, lines[1]], { mode: "none" }, { roundToWholeUnit: true });
    const edited = await makeDraft(staff, cheaper, { booking });
    expect((await errorOf(() => issue(staff, edited))).message).toContain("WB050");

    await as(db, user(manager), () => db.query("delete from public.invoices where id = $1", [edited]));
    const missing = await makeDraft(staff, computeInvoice([lines[0]], { mode: "none" }, { roundToWholeUnit: true }), { booking });
    expect((await errorOf(() => issue(staff, missing))).message).toContain("WB050");
    await as(db, user(manager), () => db.query("delete from public.invoices where id = $1", [missing]));

    const loose = await makeDraft(staff, computeInvoice(lines, { mode: "none" }, { roundToWholeUnit: true }));
    expect((await errorOf(() => issue(staff, loose))).message).toContain("WB050");
  });

  it("lets staff issue the bill exactly as the booking prices it, once", async () => {
    const t = computeInvoice(lines, { mode: "none" }, { roundToWholeUnit: true });
    const id = await makeDraft(staff, t, { booking });
    const issued = await issue(staff, id);
    expect(Number(issued.total_minor)).toBe(360000 + 200000);
    // One live bill per stay.
    const again = await errorOf(() => makeDraft(staff, t, { booking }));
    expect(again.message).toContain("invoices_one_live_per_booking");
  });

  it("lets a manager issue an edited bill", async () => {
    const other = await book(db, k, { pet: k.pets[1], start: "2028-03-01", end: "2028-03-03", kennel: k.kennels[1] });
    const t = computeInvoice([{ description: "Boarding, goodwill price", quantity: 2, unitPriceMinor: 90000 }], { mode: "none" }, { roundToWholeUnit: true });
    await issue(manager, await makeDraft(manager, t, { booking: other }));
  });
});

describe("advances and drafts", () => {
  it("counts an advance against the stay's bill, and moves it to the new bill when one is voided", async () => {
    await setTax("none", false, true);
    const b = await book(db, k, { pet: k.pets[2], start: "2028-05-01", end: "2028-05-03", kennel: k.kennels[2] });
    await as(db, user(staff), () =>
      db.query(
        "insert into public.payments (org_id, client_id, booking_id, amount_minor, method, received_on) values ($1, $2, $3, 100000, 'upi', '2028-04-20')",
        [k.org, k.client, b],
      ),
    );
    const lines = stayLines({ kind: "boarding", petName: "Dog", startDate: "2028-05-01", endDate: "2028-05-03", rateMinor: 120000 });
    const t = computeInvoice(lines, { mode: "none" }, { roundToWholeUnit: true });
    const first = await makeDraft(staff, t, { booking: b });
    await issue(staff, first);
    const balance = (id: string) =>
      as(db, user(staff), async () => (await db.query<{ paid_minor: number; due_minor: number }>("select paid_minor, due_minor from public.invoice_balances where invoice_id = $1", [id])).rows[0]);
    expect(await balance(first)).toEqual({ paid_minor: 100000, due_minor: 140000 });

    await as(db, user(manager), () => db.query("select public.void_invoice($1, 'Wrong dates')", [first]));
    const second = await makeDraft(staff, t, { booking: b });
    await issue(staff, second);
    expect(await balance(second)).toEqual({ paid_minor: 100000, due_minor: 140000 });
  });

  it("replaces a draft's lines in one go, and refuses to touch an issued bill", async () => {
    const round = { roundToWholeUnit: true };
    const t1 = computeInvoice([{ description: "A", quantity: 1, unitPriceMinor: 1000 }], { mode: "none" }, round);
    const t2 = computeInvoice([{ description: "B", quantity: 2, unitPriceMinor: 1000 }, { description: "C", quantity: 1, unitPriceMinor: 5 }], { mode: "none" }, round);
    const id = await makeDraft(manager, t1);
    const p = payload(t2);
    await as(db, user(staff), () => db.query("select public.save_invoice_draft($1, $2, $3)", [id, JSON.stringify(p.totals), JSON.stringify(p.lines)]));
    const rows = await db.query<{ description: string }>("select description from public.invoice_lines where invoice_id = $1 order by sort_order", [id]);
    expect(rows.rows.map((r) => r.description)).toEqual(["B", "C"]);

    await issue(manager, id);
    const e = await errorOf(() => as(db, user(manager), () => db.query("select public.save_invoice_draft($1, $2, $3)", [id, JSON.stringify(p.totals), JSON.stringify(p.lines)])));
    expect(e.message).toMatch(/WB051|WB032/);
  });
});
