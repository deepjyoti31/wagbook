import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeInvoice, fiscalYear, formatInvoiceNumber, type InvoiceTotals, type TaxContext } from "../../src/lib/core";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { anon, as, createTestDb, errorOf, user } from "./harness";

let db: PGlite;
let k: Kennel;
let staff: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
});
afterAll(() => db.close());

/**
 * Write a draft invoice the way the app does: numbers come from src/lib/core/tax.ts.
 * By a manager unless said otherwise: staff may only issue a bill that matches its booking.
 */
async function draft(totals: InvoiceTotals, actor: string = manager, booking: string | null = null): Promise<string> {
  return as(db, user(actor), async () => {
    const inv = await db.query<{ id: string }>(
      `insert into public.invoices (org_id, client_id, booking_id, subtotal_minor, discount_minor, taxable_minor,
         cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning id`,
      [k.org, k.client, booking, totals.subtotalMinor, totals.discountMinor, totals.taxableMinor, totals.cgstMinor,
        totals.sgstMinor, totals.igstMinor, totals.taxMinor, totals.roundOffMinor, totals.totalMinor],
    );
    let i = 0;
    for (const l of totals.lines) {
      await db.query(
        `insert into public.invoice_lines (org_id, invoice_id, sort_order, description, sac_code, quantity, unit_price_minor,
           discount_minor, taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, igst_minor, tax_minor, total_minor)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [k.org, inv.rows[0].id, i++, l.description, l.sacCode, l.quantity, l.unitPriceMinor, l.discountMinor, l.taxableMinor,
          l.taxRateBp, l.cgstMinor, l.sgstMinor, l.igstMinor, l.taxMinor, l.totalMinor],
      );
    }
    return inv.rows[0].id;
  });
}

const noTax: TaxContext = { mode: "none" };
const threeNights = (ctx: TaxContext = noTax) =>
  computeInvoice([{ description: "Boarding: Bruno, 3 nights", quantity: 3, unitPriceMinor: 120000, taxRateBp: 1800 }], ctx, {
    roundToWholeUnit: true,
  });

describe("issuing invoices", () => {
  it("hands out consecutive numbers for the financial year and freezes the parties' details", async () => {
    const first = await draft(threeNights());
    const second = await draft(threeNights());

    const issued = await as(db, user(manager), async () => {
      const a = await db.query<{ number: string; seq: number; fiscal_year: string; status: string; issued_on: string; issued_by: string; seller: { trade_name: string }; buyer: { phone: string }; is_tax_invoice: boolean }>(
        "select number, seq, fiscal_year, status, issued_on::text, issued_by, seller, buyer, is_tax_invoice from public.issue_invoice($1)",
        [first],
      );
      const b = await db.query<{ number: string; seq: number }>("select number, seq from public.issue_invoice($1)", [second]);
      return [a.rows[0], b.rows[0]] as const;
    });

    const today = (await db.query<{ d: string }>("select (now() at time zone 'Asia/Kolkata')::date::text as d")).rows[0].d;
    const fy = fiscalYear(today);
    expect(issued[0].status).toBe("issued");
    expect(issued[0].fiscal_year).toBe(fy);
    expect(issued[0].issued_on).toBe(today);
    expect(issued[0].issued_by).toBe(manager);
    expect(issued[0].is_tax_invoice).toBe(false);
    expect(issued[0].seller.trade_name).toContain("Test Kennel");
    expect(issued[0].buyer.phone).toMatch(/^\+91/);
    // The database and the TypeScript formatter must agree on the printed number.
    expect(issued[0].number).toBe(formatInvoiceNumber("WB", fy, issued[0].seq));
    expect(issued[1].seq).toBe(issued[0].seq + 1);
    expect(issued[1].number).toBe(formatInvoiceNumber("WB", fy, issued[1].seq));
  });

  it("refuses an invoice whose totals do not match its lines", async () => {
    const good = threeNights();
    const id = await draft({ ...good, totalMinor: good.totalMinor - 10000 });
    const e = await errorOf(() => as(db, user(manager), () => db.query("select public.issue_invoice($1)", [id])));
    expect(e.message).toContain("WB037");
    // A failed attempt must not burn a number.
    const ok = await draft(good);
    const before = (await db.query<{ last_seq: number }>("select last_seq from public.invoice_counters where org_id = $1", [k.org])).rows[0].last_seq;
    await as(db, user(manager), () => db.query("select public.issue_invoice($1)", [ok]));
    const after = (await db.query<{ last_seq: number }>("select last_seq from public.invoice_counters where org_id = $1", [k.org])).rows[0].last_seq;
    expect(after).toBe(before + 1);
  });

  it("refuses an empty invoice and a second issue of the same invoice", async () => {
    const empty = await draft({ ...threeNights(), lines: [], taxableMinor: 0, subtotalMinor: 0, totalMinor: 0 });
    expect((await errorOf(() => as(db, user(manager), () => db.query("select public.issue_invoice($1)", [empty])))).message).toContain("WB036");
    const id = await draft(threeNights());
    await as(db, user(manager), () => db.query("select public.issue_invoice($1)", [id]));
    expect((await errorOf(() => as(db, user(manager), () => db.query("select public.issue_invoice($1)", [id])))).message).toContain("WB035");
  });

  it("cannot be bypassed by writing the status, number or sequence directly", async () => {
    const id = await draft(threeNights());
    // Clients are not allowed to write these columns at all.
    for (const sql of [
      "update public.invoices set status = 'issued' where id = $1",
      "update public.invoices set number = 'WB/1' where id = $1",
      "update public.invoices set seq = 999, fiscal_year = '2026-27' where id = $1",
      "update public.invoices set public_token = repeat('b', 64) where id = $1",
      "update public.invoices set seller = '{}'::jsonb, is_tax_invoice = true where id = $1",
    ]) {
      const e = await errorOf(() => as(db, user(k.owner), () => db.query(sql, [id])));
      expect(e.code, sql).toBe("42501");
    }
    const e2 = await errorOf(() =>
      as(db, user(k.owner), () =>
        db.query("insert into public.invoices (org_id, client_id, status, number) values ($1, $2, 'issued', 'WB/9')", [k.org, k.client]),
      ),
    );
    expect(e2.code).toBe("42501");
    const e3 = await errorOf(() => as(db, user(k.owner), () => db.query("select * from public.invoice_counters")));
    expect(e3.code).toBe("42501");
  });

  it("refuses lines whose arithmetic is wrong, even when the totals agree with them", async () => {
    const good = threeNights();
    // Ten nights billed as if they cost five rupees.
    const cheat = { ...good, lines: [{ ...good.lines[0], quantity: 10, taxableMinor: 500, totalMinor: 500 }], taxableMinor: 500, totalMinor: 500, subtotalMinor: 500 };
    const cheatId = await draft(cheat);
    const e1 = await errorOf(() => as(db, user(manager), () => db.query("select public.issue_invoice($1)", [cheatId])));
    expect(e1.message).toContain("WB037");
    // A round off that the rounding rule does not produce.
    const shaved = { ...good, roundOffMinor: -99, totalMinor: good.totalMinor - 99 };
    const shavedId = await draft(shaved);
    const e2 = await errorOf(() => as(db, user(manager), () => db.query("select public.issue_invoice($1)", [shavedId])));
    expect(e2.message).toContain("WB037");
  });

  it("marks the invoice as a tax invoice and keeps CGST and SGST when the kennel is GST registered", async () => {
    const g = await seedKennel(db);
    await as(db, user(g.owner), () =>
      db.query(
        "update public.organizations set tax_mode = 'gst_india', tax_id = '29AAGCB7383J1Z4', gst_state_code = '29', default_tax_rate_bp = 1800, invoice_prefix = 'DC' where id = $1",
        [g.org],
      ),
    );
    const totals = threeNights({ mode: "gst_india", sellerStateCode: "29" });
    expect(totals.cgstMinor).toBe(32400);
    const id = await as(db, user(g.owner), async () => {
      const inv = await db.query<{ id: string }>(
        `insert into public.invoices (org_id, client_id, subtotal_minor, taxable_minor, cgst_minor, sgst_minor, tax_minor, total_minor)
         values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
        [g.org, g.client, totals.subtotalMinor, totals.taxableMinor, totals.cgstMinor, totals.sgstMinor, totals.taxMinor, totals.totalMinor],
      );
      const l = totals.lines[0];
      await db.query(
        `insert into public.invoice_lines (org_id, invoice_id, description, quantity, unit_price_minor, taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, tax_minor, total_minor)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
        [g.org, inv.rows[0].id, l.description, l.quantity, l.unitPriceMinor, l.taxableMinor, l.taxRateBp, l.cgstMinor, l.sgstMinor, l.taxMinor, l.totalMinor],
      );
      return inv.rows[0].id;
    });
    const issued = await as(db, user(g.owner), () =>
      db.query<{ number: string; is_tax_invoice: boolean; place_of_supply_state_code: string; seller: { tax_id: string }; total_minor: string }>(
        "select number, is_tax_invoice, place_of_supply_state_code, seller, total_minor from public.issue_invoice($1)",
        [id],
      ),
    );
    expect(issued.rows[0].number).toMatch(/^DC\/\d{2}-\d{2}\/0001$/);
    expect(issued.rows[0].is_tax_invoice).toBe(true);
    expect(issued.rows[0].place_of_supply_state_code).toBe("29");
    expect(issued.rows[0].seller.tax_id).toBe("29AAGCB7383J1Z4");
    expect(Number(issued.rows[0].total_minor)).toBe(424800);
  });

  it("requires a GSTIN and state before GST mode can be switched on", async () => {
    const g = await seedKennel(db);
    const e = await errorOf(() => as(db, user(g.owner), () => db.query("update public.organizations set tax_mode = 'gst_india' where id = $1", [g.org])));
    expect(e.message).toContain("organizations_gst_needs_registration");
  });
});

describe("settings that bills depend on", () => {
  it("can change freely until the first bill is issued, then the currency and year start are fixed", async () => {
    const g = await seedKennel(db);
    const set = (sql: string) => as(db, user(g.owner), () => db.query(sql, [g.org]));
    await set("update public.organizations set currency = 'USD', fiscal_year_start_month = 1 where id = $1");
    await set("update public.organizations set currency = 'INR', fiscal_year_start_month = 4 where id = $1");

    // A draft does not count.
    const d = await as(db, user(g.owner), async () => {
      const r = await db.query<{ id: string }>(
        `insert into public.invoices (org_id, client_id, subtotal_minor, taxable_minor, total_minor) values ($1, $2, 100, 100, 100) returning id`,
        [g.org, g.client],
      );
      await db.query(
        `insert into public.invoice_lines (org_id, invoice_id, description, quantity, unit_price_minor, taxable_minor, total_minor) values ($1, $2, 'Walk', 1, 100, 100, 100)`,
        [g.org, r.rows[0].id],
      );
      return r.rows[0].id;
    });
    await set("update public.organizations set fiscal_year_start_month = 1 where id = $1");
    await set("update public.organizations set fiscal_year_start_month = 4 where id = $1");

    await as(db, user(g.owner), () => db.query("select public.issue_invoice($1)", [d]));
    for (const sql of [
      "update public.organizations set currency = 'USD' where id = $1",
      "update public.organizations set fiscal_year_start_month = 1 where id = $1",
    ]) {
      expect((await errorOf(() => set(sql))).message, sql).toContain("WB052");
    }
    // Everything else, and saving the same values again, still works.
    await set("update public.organizations set name = 'Renamed Kennel', currency = 'INR', fiscal_year_start_month = 4 where id = $1");
    // A cancelled bill still used its number.
    await as(db, user(g.owner), () => db.query("select public.void_invoice($1, 'Wrong parent')", [d]));
    expect((await errorOf(() => set("update public.organizations set currency = 'USD' where id = $1"))).message).toContain("WB052");
  });
});

describe("issued invoices are frozen", () => {
  let id: string;
  beforeAll(async () => {
    id = await draft(threeNights());
    await as(db, user(manager), () => db.query("select public.issue_invoice($1)", [id]));
  });

  it("cannot be edited, have lines changed, or be deleted", async () => {
    for (const sql of [
      "update public.invoices set total_minor = 1 where id = $1",
      "update public.invoices set notes = 'tweak' where id = $1",
      "update public.invoice_lines set description = 'changed' where invoice_id = $1",
      "delete from public.invoice_lines where invoice_id = $1",
      "delete from public.invoices where id = $1",
    ]) {
      const e = await errorOf(() => as(db, user(k.owner), () => db.query(sql, [id])));
      expect(e.message, sql).toMatch(/WB03[02]/);
    }
    const e = await errorOf(() =>
      as(db, user(k.owner), () =>
        db.query(
          "insert into public.invoice_lines (org_id, invoice_id, description, quantity, unit_price_minor, taxable_minor, total_minor) values ($1, $2, 'sneak', 1, 100, 100, 100)",
          [k.org, id],
        ),
      ),
    );
    expect(e.message).toContain("WB032");
  });

  it("can be voided by a manager with a reason, never by staff, and keeps its number", async () => {
    expect((await errorOf(() => as(db, user(staff), () => db.query("select public.void_invoice($1, 'oops')", [id])))).message).toContain("WB002");
    expect((await errorOf(() => as(db, user(k.owner), () => db.query("select public.void_invoice($1, '  ')", [id])))).message).toContain("WB039");
    const v = await as(db, user(k.owner), () =>
      db.query<{ status: string; number: string; void_reason: string }>("select status, number, void_reason from public.void_invoice($1, 'Wrong dates')", [id]),
    );
    expect(v.rows[0].status).toBe("void");
    expect(v.rows[0].number).toMatch(/^WB\//);
    expect((await errorOf(() => as(db, user(k.owner), () => db.query("update public.invoices set notes = 'x' where id = $1", [id])))).message).toContain("WB031");
  });

  it("lets drafts be edited and deleted freely", async () => {
    const d = await draft(threeNights());
    await as(db, user(k.owner), async () => {
      await db.query("update public.invoices set notes = 'still a draft' where id = $1", [d]);
      const del = await db.query("delete from public.invoices where id = $1", [d]);
      expect(del.affectedRows).toBe(1);
    });
  });
});

describe("payments and balances", () => {
  it("tracks what is paid and what is due, including refunds", async () => {
    const bookingId = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", kennel: k.kennels[0] });
    const id = await draft(threeNights(), staff, bookingId);
    await as(db, user(staff), async () => {
      await db.query("select public.issue_invoice($1)", [id]);
      await db.query(
        "insert into public.payments (org_id, client_id, invoice_id, amount_minor, method, reference, received_on) values ($1, $2, $3, 100000, 'upi', 'UTR123', '2027-04-14')",
        [k.org, k.client, id],
      );
      // ₹200 more than the bill: the parent paid ₹3,800 for ₹3,600.
      await db.query(
        "insert into public.payments (org_id, client_id, invoice_id, amount_minor, method, received_on) values ($1, $2, $3, 280000, 'cash', '2027-04-17')",
        [k.org, k.client, id],
      );
    });
    // Only an owner or manager can record a refund.
    const refund = "insert into public.payments (org_id, client_id, invoice_id, direction, amount_minor, method, received_on) values ($1, $2, $3, 'out', 20000, 'upi', '2027-04-18')";
    expect((await errorOf(() => as(db, user(staff), () => db.query(refund, [k.org, k.client, id])))).code).toBe("42501");
    await as(db, user(k.owner), async () => {
      const before = await db.query<{ due_minor: string }>("select due_minor from public.invoice_balances where invoice_id = $1", [id]);
      expect(Number(before.rows[0].due_minor)).toBe(-20000);
      await db.query(refund, [k.org, k.client, id]);
      const bal = await db.query<{ total_minor: string; paid_minor: string; due_minor: string }>(
        "select total_minor, paid_minor, due_minor from public.invoice_balances where invoice_id = $1",
        [id],
      );
      expect(Number(bal.rows[0].total_minor)).toBe(360000);
      expect(Number(bal.rows[0].paid_minor)).toBe(360000);
      expect(Number(bal.rows[0].due_minor)).toBe(0);
    });

    // Staff record payments but cannot rewrite or remove them.
    await as(db, user(staff), async () => {
      expect((await db.query("update public.payments set amount_minor = 1 where invoice_id = $1", [id])).affectedRows).toBe(0);
      expect((await db.query("delete from public.payments where invoice_id = $1", [id])).affectedRows).toBe(0);
    });
    expect((await errorOf(() => as(db, user(staff), () =>
      db.query("insert into public.payments (org_id, client_id, amount_minor, method, received_on) values ($1, $2, 0, 'cash', '2027-04-17')", [k.org, k.client]),
    ))).code).toBe("23514");
  });
});

describe("the parent's invoice link", () => {
  it("shows an issued invoice to anyone holding the token, and nothing otherwise", async () => {
    const id = await draft(threeNights());
    const token = (await db.query<{ public_token: string }>("select public_token from public.invoices where id = $1", [id])).rows[0].public_token;

    // A draft is never public.
    await as(db, anon, async () => {
      expect((await db.query<{ v: unknown }>("select public.get_public_invoice($1) as v", [token])).rows[0].v).toBeNull();
    });

    await as(db, user(k.owner), async () => {
      await db.query("update public.organizations set upi_vpa = 'testkennel@okbank' where id = $1", [k.org]);
      await db.query("select public.issue_invoice($1)", [id]);
    });

    await as(db, anon, async () => {
      const res = await db.query<{ v: { number: string; total_minor: number; lines: unknown[]; upi: { vpa: string }; buyer: { name: string } } }>(
        "select public.get_public_invoice($1) as v",
        [token],
      );
      const v = res.rows[0].v;
      expect(v.number).toMatch(/^WB\//);
      expect(v.total_minor).toBe(360000);
      expect(v.lines).toHaveLength(1);
      expect(v.upi.vpa).toBe("testkennel@okbank");
      expect(JSON.stringify(v)).not.toContain(token);

      for (const bad of ["", "x", token.slice(0, 63), `${token}0`, "0".repeat(64)]) {
        expect((await db.query<{ v: unknown }>("select public.get_public_invoice($1) as v", [bad])).rows[0].v).toBeNull();
      }
    });
  });
});

describe("financial year labels", () => {
  it("agree between the database and TypeScript", async () => {
    for (const date of ["2027-03-31", "2027-04-01", "2026-12-31", "2099-12-01", "2028-02-29"]) {
      for (const start of [4, 1, 7]) {
        const res = await db.query<{ fy: string }>("select public.fiscal_year_label($1::date, $2::int) as fy", [date, start]);
        expect(res.rows[0].fy, `${date} start ${start}`).toBe(fiscalYear(date, start));
      }
    }
  });
});
