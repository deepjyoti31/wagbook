import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeInvoice, todayIn, type InvoiceTotals } from "../../src/lib/core";
import { creditPayload, partCredit, type CreditableBill } from "../../src/lib/billing";
import { addMember, seedKennel, type Kennel } from "./fixtures";
import { admin, anon, as, createTestDb, errorOf, user } from "./harness";

/**
 * Credit notes: all or part of an issued bill taken back, in the month it is
 * made, with its own numbers. A tax invoice from an earlier month is credited,
 * never cancelled, and tax reports count each in its own month.
 */

let db: PGlite;
let k: Kennel;
let staff: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  await as(db, user(k.owner), () =>
    db.query(
      "update public.organizations set tax_mode = 'gst_india', tax_id = '29AAGCB7383J1Z4', gst_state_code = '29', default_tax_rate_bp = 1800 where id = $1",
      [k.org],
    ),
  );
});
afterAll(() => db.close());

const gst = { mode: "gst_india" as const, sellerStateCode: "29", placeOfSupplyStateCode: "29" };
// Three nights at ₹1,200 and a bath at ₹500, GST at 18%: ₹4,838 in all.
const bill = () =>
  computeInvoice(
    [
      { description: "Boarding: Bruno, 3 nights", quantity: 3, unitPriceMinor: 120000, taxRateBp: 1800, sacCode: "998612" },
      { description: "Bath", quantity: 1, unitPriceMinor: 50000, taxRateBp: 1800 },
    ],
    gst,
    { roundToWholeUnit: true },
  );

/** An issued bill, made as the app makes one. */
async function issuedBill(t: InvoiceTotals = bill()): Promise<string> {
  return as(db, user(manager), async () => {
    const r = await db.query<{ id: string }>("insert into public.invoices (org_id, client_id) values ($1, $2) returning id", [k.org, k.client]);
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

async function billRow(id: string): Promise<CreditableBill> {
  return as(db, user(manager), async () =>
    (await db.query<CreditableBill>("select is_tax_invoice, prices_include_tax, place_of_supply_state_code, seller from public.invoices where id = $1", [id])).rows[0],
  );
}

/** Credit `amount` (before tax) of a bill at 18%, as the bill page does. */
async function credit(id: string, amountMinor: number, actor = manager, reason = "Went home a night early") {
  const t = partCredit(await billRow(id), { description: "One night not stayed", amountMinor, taxRateBp: 1800, sacCode: "998612" }, true);
  const p = creditPayload(t);
  return as(db, user(actor), async () =>
    (
      await db.query<{ number: string; total_minor: string; issued_on: string; tax_minor: string }>(
        "select number, total_minor, issued_on::text, tax_minor from public.issue_credit_note($1, $2, $3, $4)",
        [id, reason, JSON.stringify(p.p_totals), JSON.stringify(p.p_lines)],
      )
    ).rows[0],
  );
}

const balance = (id: string) =>
  as(db, user(manager), async () => {
    const r = (await db.query<{ credited_minor: string; due_minor: string }>("select credited_minor, due_minor from public.invoice_balances where invoice_id = $1", [id])).rows[0];
    return { credited: Number(r.credited_minor), due: Number(r.due_minor) };
  });

describe("credit notes", () => {
  it("take back part of a bill with their own numbers, and the bill owes that much less", async () => {
    const id = await issuedBill();
    const first = await credit(id, 120000);
    // ₹1,200 and 18% GST.
    expect(Number(first.total_minor)).toBe(141600);
    expect(Number(first.tax_minor)).toBe(21600);
    expect(first.number).toMatch(/^CN\/\d{2}-\d{2}\/0001$/);
    expect(first.issued_on).toBe(todayIn("Asia/Kolkata"));
    expect((await credit(id, 50000)).number).toMatch(/\/0002$/);
    expect(await balance(id)).toEqual({ credited: 141600 + 59000, due: 483800 - 141600 - 59000 });
  });

  it("can take back the whole bill with its own lines, to the paisa", async () => {
    const id = await issuedBill();
    const note = await as(db, user(manager), async () => {
      const inv = (await db.query<Record<string, number>>("select taxable_minor, cgst_minor, sgst_minor, igst_minor, tax_minor, discount_minor, round_off_minor, total_minor from public.invoices where id = $1", [id])).rows[0];
      const lines = (await db.query("select description, sac_code, quantity, unit_price_minor, discount_minor, taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, igst_minor, tax_minor, total_minor from public.invoice_lines where invoice_id = $1 order by sort_order", [id])).rows;
      return (await db.query<{ total_minor: string }>("select total_minor from public.issue_credit_note($1, 'Booked by mistake', $2, $3)", [id, JSON.stringify(inv), JSON.stringify(lines)])).rows[0];
    });
    expect(Number(note.total_minor)).toBe(483800);
    expect(await balance(id)).toEqual({ credited: 483800, due: 0 });
  });

  it("never take back more than is left on the bill", async () => {
    const id = await issuedBill();
    // ₹4,100 was billed before tax; ₹3,000 and then ₹1,200 would be ₹4,200.
    await credit(id, 300000);
    expect((await errorOf(() => credit(id, 120000))).message).toContain("WB092");
    await credit(id, 110000);
    expect((await balance(id)).due).toBe(0);
  });

  it("are for owners and managers, with a reason, against an issued bill, at a rate the bill charged", async () => {
    const id = await issuedBill();
    expect((await errorOf(() => credit(id, 10000, staff))).message).toContain("WB002");
    expect((await errorOf(() => credit(id, 10000, manager, "  "))).message).toContain("WB091");
    const p = creditPayload(partCredit(await billRow(id), { description: "x", amountMinor: 10000, taxRateBp: 500, sacCode: null }, true));
    const rate = await errorOf(() =>
      as(db, user(manager), () => db.query("select public.issue_credit_note($1, 'Wrong rate', $2, $3)", [id, JSON.stringify(p.p_totals), JSON.stringify(p.p_lines)])),
    );
    expect(rate.message).toContain("WB093");
    const draft = await as(db, user(manager), async () =>
      (await db.query<{ id: string }>("insert into public.invoices (org_id, client_id) values ($1, $2) returning id", [k.org, k.client])).rows[0].id,
    );
    expect((await errorOf(() => credit(draft, 10000))).message).toContain("WB090");
  });

  it("refuse sums that do not add up", async () => {
    const id = await issuedBill();
    const p = creditPayload(partCredit(await billRow(id), { description: "x", amountMinor: 10000, taxRateBp: 1800, sacCode: null }, true));
    const lines = p.p_lines.map((l) => ({ ...l, cgst_minor: l.cgst_minor + 1 }));
    const e = await errorOf(() =>
      as(db, user(manager), () => db.query("select public.issue_credit_note($1, 'Bad sums', $2, $3)", [id, JSON.stringify(p.p_totals), JSON.stringify(lines)])),
    );
    expect(e.message).toContain("WB037");
  });

  it("can be read by the kennel and seen on the parent's bill, and written by nobody directly", async () => {
    const id = await issuedBill();
    await credit(id, 120000);
    const write = await errorOf(() =>
      as(db, user(k.owner), () => db.query("update public.credit_notes set reason = 'Changed' where invoice_id = $1", [id])),
    );
    expect(write.message).toMatch(/permission denied/);
    const del = await errorOf(() => as(db, user(k.owner), () => db.query("delete from public.credit_notes where invoice_id = $1", [id])));
    expect(del.message).toMatch(/permission denied/);
    const insert = await errorOf(() =>
      as(db, user(k.owner), () =>
        db.query("insert into public.credit_notes (org_id, invoice_id, number, fiscal_year, seq, issued_on, reason, currency, subtotal_minor, discount_minor, taxable_minor, cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor) values ($1, $2, 'CN/99-00/0001', '2099-00', 1, now(), 'x', 'INR', 1, 0, 1, 0, 0, 0, 0, 0, 1)", [k.org, id]),
      ),
    );
    expect(insert.message).toMatch(/permission denied/);

    const token = (await db.query<{ public_token: string }>("select public_token from public.invoices where id = $1", [id])).rows[0].public_token;
    const seen = await as(db, anon, async () =>
      (await db.query<{ v: { credit_notes: { number: string; total_minor: number; lines: unknown[] }[] } }>("select public.get_public_invoice($1) as v", [token])).rows[0].v,
    );
    expect(seen.credit_notes).toHaveLength(1);
    expect(seen.credit_notes[0].total_minor).toBe(141600);
    expect(seen.credit_notes[0].lines).toHaveLength(1);
  });
});

describe("cancelling a bill", () => {
  it("is refused for a tax invoice from an earlier month: it is credited instead", async () => {
    const id = await issuedBill();
    // Move the bill into last month, as if it had been issued then.
    await as(db, admin, async () => {
      await db.query("set session_replication_role = replica");
      await db.query("update public.invoices set issued_on = date_trunc('month', current_date)::date - 1 where id = $1", [id]);
      await db.query("set session_replication_role = default");
    });
    const e = await errorOf(() => as(db, user(manager), () => db.query("select public.void_invoice($1, 'Wrong parent')", [id])));
    expect(e.message).toContain("WB095");
    await credit(id, 410000);
  });

  it("is refused once a credit note has gone out against the bill", async () => {
    const id = await issuedBill();
    await credit(id, 10000);
    const e = await errorOf(() => as(db, user(manager), () => db.query("select public.void_invoice($1, 'Changed my mind')", [id])));
    expect(e.message).toContain("WB096");
  });

  it("is still allowed in the month the bill was issued", async () => {
    const id = await issuedBill();
    await as(db, user(manager), () => db.query("select public.void_invoice($1, 'Wrong parent')", [id]));
  });
});

describe("reports", () => {
  it("count a credit note in the month it was made, against the tax of that month", async () => {
    const k2 = await seedKennel(db);
    const m2 = await addMember(db, k2, "manager");
    await as(db, user(k2.owner), () =>
      db.query("update public.organizations set tax_mode = 'gst_india', tax_id = '29AAGCB7383J1Z4', gst_state_code = '29' where id = $1", [k2.org]),
    );
    const today = todayIn("Asia/Kolkata");
    const month = `${today.slice(0, 8)}01`;
    const id = await as(db, user(m2), async () => {
      const t = bill();
      const r = await db.query<{ id: string }>("insert into public.invoices (org_id, client_id) values ($1, $2) returning id", [k2.org, k2.client]);
      const p = creditPayload(t);
      await db.query("select public.save_invoice_draft($1, $2, $3)", [r.rows[0].id, JSON.stringify(p.p_totals), JSON.stringify(p.p_lines)]);
      await db.query("select public.issue_invoice($1)", [r.rows[0].id]);
      return r.rows[0].id;
    });
    const row = await as(db, user(m2), async () =>
      (await db.query<CreditableBill>("select is_tax_invoice, prices_include_tax, place_of_supply_state_code, seller from public.invoices where id = $1", [id])).rows[0],
    );
    const p = creditPayload(partCredit(row, { description: "Night not stayed", amountMinor: 120000, taxRateBp: 1800, sacCode: null }, true));
    await as(db, user(m2), () => db.query("select public.issue_credit_note($1, 'Early', $2, $3)", [id, JSON.stringify(p.p_totals), JSON.stringify(p.p_lines)]));

    await as(db, user(m2), async () => {
      const money = (await db.query<{ billed_minor: string; credited_minor: string; tax_minor: string }>("select billed_minor, credited_minor, tax_minor from public.report_money($1, $2, $3)", [k2.org, month, today])).rows[0];
      expect(Number(money.billed_minor)).toBe(483800);
      expect(Number(money.credited_minor)).toBe(141600);
      expect(Number(money.tax_minor)).toBe(73800 - 21600);
      const tax = (await db.query<{ bills: number; credit_notes: number; taxable_minor: string; tax_minor: string }>("select bills, credit_notes, taxable_minor, tax_minor from public.report_tax($1, $2, $3)", [k2.org, month, today])).rows[0];
      expect(tax).toMatchObject({ bills: 1, credit_notes: 1 });
      expect(Number(tax.taxable_minor)).toBe(410000 - 120000);
      expect(Number(tax.tax_minor)).toBe(73800 - 21600);
    });
  });
});

describe("the bill prefix", () => {
  it("cannot be CN, which credit notes use", async () => {
    const e = await errorOf(() => as(db, user(k.owner), () => db.query("update public.organizations set invoice_prefix = 'CN' where id = $1", [k.org])));
    expect(e.message).toContain("organizations_invoice_prefix_check");
  });
});
