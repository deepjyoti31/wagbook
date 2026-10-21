import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeInvoice, type InvoiceTotals } from "../../src/lib/core";
import { creditPayload, partCredit, type CreditableBill } from "../../src/lib/billing";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

/**
 * Refunds (D40): money goes back only when the parent paid more than they
 * owe. On a bill, that is what was paid over the bill less its credit notes;
 * on a stay with no bill, the advance. A stay that got shorter is credited
 * first, so the books say why the money went back.
 */

let db: PGlite;
let k: Kennel;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 3 });
  manager = await addMember(db, k, "manager");
});
afterAll(() => db.close());

const none = { mode: "none" as const, sellerStateCode: null, placeOfSupplyStateCode: null };
// Three nights at ₹1,200: ₹3,600.
const threeNights = () => computeInvoice([{ description: "Boarding: Bruno, 3 nights", quantity: 3, unitPriceMinor: 120000 }], none, { roundToWholeUnit: true });

/** An issued bill for a stay, made as the app makes one. */
async function issuedBill(bookingId: string, t: InvoiceTotals = threeNights()): Promise<string> {
  return as(db, user(manager), async () => {
    const r = await db.query<{ id: string }>("insert into public.invoices (org_id, client_id, booking_id) values ($1, $2, $3) returning id", [k.org, k.client, bookingId]);
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

const pay = (where: { invoice?: string; booking?: string }, direction: "in" | "out", amount: number) =>
  as(db, user(manager), () =>
    db.query(
      "insert into public.payments (org_id, client_id, invoice_id, booking_id, direction, amount_minor, method, received_on) values ($1, $2, $3, $4, $5, $6, 'upi', '2027-04-18')",
      [k.org, k.client, where.invoice ?? null, where.booking ?? null, direction, amount],
    ),
  );

const due = (id: string) =>
  as(db, user(manager), async () => Number((await db.query<{ due_minor: string }>("select due_minor from public.invoice_balances where invoice_id = $1", [id])).rows[0].due_minor));

describe("refunds on a bill", () => {
  it("give back only what was paid over what the bill now comes to", async () => {
    const stay = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", kennel: k.kennels[0] });
    const bill = await issuedBill(stay);
    await pay({ invoice: bill }, "in", 360000);
    // Paid in full and owed in full: nothing to give back.
    expect((await errorOf(() => pay({ invoice: bill }, "out", 10000))).message).toContain("WB121");

    // Bruno went home a night early: a credit note for the night, then the refund of it.
    const creditable = await as(db, user(manager), async () =>
      (await db.query<CreditableBill>("select is_tax_invoice, prices_include_tax, place_of_supply_state_code, seller from public.invoices where id = $1", [bill])).rows[0],
    );
    const p = creditPayload(partCredit(creditable, { description: "One night not stayed", amountMinor: 120000, taxRateBp: 0, sacCode: null }, true));
    await as(db, user(manager), () =>
      db.query("select public.issue_credit_note($1, 'Went home early', $2, $3)", [bill, JSON.stringify(p.p_totals), JSON.stringify(p.p_lines)]),
    );
    expect(await due(bill)).toBe(-120000);
    expect((await errorOf(() => pay({ invoice: bill }, "out", 120001))).message).toContain("WB121");
    await pay({ invoice: bill }, "out", 120000);
    expect(await due(bill)).toBe(0);
    expect((await errorOf(() => pay({ invoice: bill }, "out", 100))).message).toContain("WB121");
  });

  it("cannot be raised later by turning a payment into a bigger refund", async () => {
    const stay = await book(db, k, { pet: k.pets[1], start: "2027-05-14", end: "2027-05-17", kennel: k.kennels[1] });
    const bill = await issuedBill(stay);
    await pay({ invoice: bill }, "in", 380000);
    await pay({ invoice: bill }, "out", 20000);
    expect(
      (await errorOf(() => as(db, user(manager), () => db.query("update public.payments set amount_minor = 30000 where invoice_id = $1 and direction = 'out'", [bill])))).message,
    ).toContain("WB121");
  });
});

describe("refunds of an advance", () => {
  it("give back no more than was paid for the stay, and name a bill or a stay", async () => {
    const stay = await book(db, k, { pet: k.pets[2], start: "2027-06-14", end: "2027-06-17", kennel: k.kennels[2] });
    await pay({ booking: stay }, "in", 50000);
    await as(db, user(k.owner), () => db.query("update public.bookings set status = 'cancelled', cancel_reason = 'Plans changed' where id = $1", [stay]));
    expect((await errorOf(() => pay({ booking: stay }, "out", 50001))).message).toContain("WB122");
    await pay({ booking: stay }, "out", 30000);
    expect((await errorOf(() => pay({ booking: stay }, "out", 20001))).message).toContain("WB122");
    await pay({ booking: stay }, "out", 20000);
    expect((await errorOf(() => pay({}, "out", 100))).message).toContain("WB120");
  });
});
