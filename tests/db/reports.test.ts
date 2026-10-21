import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeInvoice, type InvoiceTotals } from "../../src/lib/core";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { anon, as, createTestDb, createUser, errorOf, user } from "./harness";

let db: PGlite;
let k: Kennel;
let other: Kennel;
let staff: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 4, pets: 3 });
  other = await seedKennel(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
});
afterAll(() => db.close());

const REPORTS = ["report_occupancy", "report_money", "report_tax", "report_extras"] as const;

/** Run a report. Dates come back as text, the way PostgREST sends them. */
function run<T>(actor: string, fn: (typeof REPORTS)[number], org: string, from: string, to: string) {
  const dates = fn === "report_occupancy" ? ", day::text as day" : fn === "report_money" ? ", month::text as month" : "";
  return as(db, user(actor), async () => (await db.query<T>(`select *${dates} from public.${fn}($1, $2, $3)`, [org, from, to])).rows);
}

/** A draft with these totals, saved the way the app saves it, then issued. Returns the bill's id and date. */
async function issueBill(actor: string, t: InvoiceTotals): Promise<{ id: string; issuedOn: string }> {
  return as(db, user(actor), async () => {
    const r = await db.query<{ id: string }>("insert into public.invoices (org_id, client_id) values ($1, $2) returning id", [k.org, k.client]);
    const id = r.rows[0].id;
    const totals = {
      subtotal_minor: t.subtotalMinor, discount_minor: t.discountMinor, taxable_minor: t.taxableMinor, cgst_minor: t.cgstMinor,
      sgst_minor: t.sgstMinor, igst_minor: t.igstMinor, tax_minor: t.taxMinor, round_off_minor: t.roundOffMinor, total_minor: t.totalMinor,
    };
    const lines = t.lines.map((l, i) => ({
      sort_order: i, description: l.description, sac_code: l.sacCode, quantity: l.quantity, unit_price_minor: l.unitPriceMinor,
      discount_minor: l.discountMinor, taxable_minor: l.taxableMinor, tax_rate_bp: l.taxRateBp, cgst_minor: l.cgstMinor,
      sgst_minor: l.sgstMinor, igst_minor: l.igstMinor, tax_minor: l.taxMinor, total_minor: l.totalMinor,
    }));
    await db.query("select public.save_invoice_draft($1, $2, $3)", [id, JSON.stringify(totals), JSON.stringify(lines)]);
    const issued = await db.query<{ issued_on: string }>("select issued_on::text from public.issue_invoice($1)", [id]);
    return { id, issuedOn: issued.rows[0].issued_on };
  });
}

describe("who may see reports", () => {
  it("refuses staff, other kennels, strangers and the anonymous role", async () => {
    const stranger = await createUser(db, "nosy@example.test");
    for (const fn of REPORTS) {
      for (const who of [staff, other.owner, stranger]) {
        const e = await errorOf(() => run(who, fn, k.org, "2027-01-01", "2027-01-31"));
        expect(e.message, `${fn} answered someone it should not`).toContain("WB060");
      }
      const e = await errorOf(() => as(db, anon, () => db.query(`select * from public.${fn}($1, '2027-01-01', '2027-01-31')`, [k.org])));
      expect(e.code).toBe("42501");
    }
  });

  it("answers owners and managers of the kennel", async () => {
    for (const fn of REPORTS) {
      await run(k.owner, fn, k.org, "2027-01-01", "2027-01-31");
      await run(manager, fn, k.org, "2027-01-01", "2027-01-31");
    }
  });

  it("refuses a period that runs backwards or is longer than about a year", async () => {
    for (const [from, to] of [["2027-02-01", "2027-01-01"], ["2027-01-01", "2028-03-01"]]) {
      const e = await errorOf(() => run(k.owner, "report_money", k.org, from, to));
      expect(e.message).toContain("WB061");
    }
  });

  it("never counts another kennel's stays, even for a member of both", async () => {
    // The owner of k also manages the other kennel, so row level security alone would show both.
    const email = (await db.query<{ email: string }>("select email from auth.users where id = $1", [k.owner])).rows[0].email;
    await as(db, user(other.owner), () => db.query("select public.invite_member_by_email($1, $2, 'manager', 'Both')", [other.org, email]));
    await as(db, user(k.owner), () => db.query("select public.respond_to_invitation($1, true)", [other.org]));
    await book(db, other, { pet: other.pets[0], start: "2027-04-01", end: "2027-04-05" });
    const rows = await run<{ boarding: number }>(k.owner, "report_occupancy", k.org, "2027-04-01", "2027-04-04");
    expect(rows.map((r) => r.boarding)).toEqual([0, 0, 0, 0]);
  });
});

describe("occupancy", () => {
  it("counts boarding on its nights and day boarding on its days, and leaves out requests and cancellations", async () => {
    await book(db, k, { pet: k.pets[0], start: "2027-03-01", end: "2027-03-04", kennel: k.kennels[0] });
    await book(db, k, { pet: k.pets[1], start: "2027-03-03", end: "2027-03-04", kind: "daycare" });
    await book(db, k, { pet: k.pets[2], start: "2027-03-01", end: "2027-03-05", status: "cancelled" });
    await book(db, k, { pet: k.pets[2], start: "2027-03-01", end: "2027-03-05", status: "requested" });

    const rows = await run<{ day: string; boarding: number; day_boarding: number; capacity: number }>(
      manager, "report_occupancy", k.org, "2027-03-01", "2027-03-05",
    );
    expect(rows.map((r) => [r.day, r.boarding, r.day_boarding, r.capacity])).toEqual([
      ["2027-03-01", 1, 0, 4],
      ["2027-03-02", 1, 0, 4],
      ["2027-03-03", 1, 1, 4],
      ["2027-03-04", 0, 1, 4],
      ["2027-03-05", 0, 0, 4],
    ]);
  });
});

describe("money", () => {
  let issuedOn: string;
  let kept: InvoiceTotals;

  beforeAll(async () => {
    await as(db, user(k.owner), () =>
      db.query("update public.organizations set tax_mode = 'gst_india', prices_include_tax = false, round_invoice_totals = true, tax_id = '29ABCDE1234F1Z5', gst_state_code = '29' where id = $1", [k.org]),
    );
    const ctx = { mode: "gst_india" as const, sellerStateCode: "29" };
    kept = computeInvoice(
      [
        { description: "Boarding, 3 nights", quantity: 3, unitPriceMinor: 120000, taxRateBp: 1800 },
        { description: "Grooming", quantity: 1, unitPriceMinor: 70001, taxRateBp: 1200 },
      ],
      ctx,
      { roundToWholeUnit: true },
    );
    issuedOn = (await issueBill(manager, kept)).issuedOn;
    const voided = await issueBill(manager, computeInvoice([{ description: "Wrong", quantity: 1, unitPriceMinor: 999900, taxRateBp: 1800 }], ctx, { roundToWholeUnit: true }));
    await as(db, user(manager), () => db.query("select public.void_invoice($1, 'Made by mistake')", [voided.id]));

    // Advances on a stay that was later cancelled, and part of one refunded (a refund names its stay or bill).
    const stay = await book(db, k, { pet: k.pets[2], start: "2030-05-01", end: "2030-05-03", status: "cancelled" });
    await as(db, user(manager), async () => {
      const pay = "insert into public.payments (org_id, client_id, booking_id, direction, amount_minor, method, received_on) values ($1, $2, $3, $4, $5, 'upi', $6)";
      await db.query(pay, [k.org, k.client, stay, "in", 50000, "2027-01-10"]);
      await db.query(pay, [k.org, k.client, stay, "out", 10000, "2027-01-20"]);
      await db.query(pay, [k.org, k.client, stay, "in", 7000, "2027-02-01"]);
      await db.query(pay, [k.org, k.client, stay, "in", 99, "2026-12-31"]);
      const spend = "insert into public.expenses (org_id, spent_on, category, amount_minor) values ($1, $2, $3, $4)";
      await db.query(spend, [k.org, "2027-01-05", "Food", 30000]);
      await db.query(spend, [k.org, "2027-02-28", "Repairs", 1000]);
    });
  });

  it("gives payments in, refunds and expenses by month, and nothing outside the period", async () => {
    const rows = await run<{ month: string; billed_minor: number; received_minor: number; refunded_minor: number; spent_minor: number }>(
      k.owner, "report_money", k.org, "2027-01-01", "2027-02-28",
    );
    expect(rows.map((r) => [r.month.slice(0, 7), Number(r.billed_minor), Number(r.received_minor), Number(r.refunded_minor), Number(r.spent_minor)])).toEqual([
      ["2027-01", 0, 50000, 10000, 30000],
      ["2027-02", 0, 7000, 0, 1000],
    ]);
  });

  it("counts issued bills by bill date and leaves cancelled bills out", async () => {
    const rows = await run<{ billed_minor: number; tax_minor: number; bills: number }>(k.owner, "report_money", k.org, issuedOn, issuedOn);
    expect(rows).toHaveLength(1);
    expect([Number(rows[0].billed_minor), Number(rows[0].tax_minor), rows[0].bills]).toEqual([kept.totalMinor, kept.taxMinor, 1]);
  });

  it("gives tax by rate, matching the bill's own arithmetic", async () => {
    const rows = await run<{ tax_rate_bp: number; bills: number; taxable_minor: number; cgst_minor: number; sgst_minor: number; igst_minor: number; tax_minor: number }>(
      manager, "report_tax", k.org, issuedOn, issuedOn,
    );
    const expected = [1200, 1800].map((rate) => {
      const l = kept.lines.find((x) => x.taxRateBp === rate)!;
      return [rate, 1, l.taxableMinor, l.cgstMinor, l.sgstMinor, l.igstMinor, l.taxMinor];
    });
    expect(rows.map((r) => [r.tax_rate_bp, r.bills, Number(r.taxable_minor), Number(r.cgst_minor), Number(r.sgst_minor), Number(r.igst_minor), Number(r.tax_minor)])).toEqual(expected);
  });
});

describe("extras", () => {
  it("ranks extras on real stays by value, grouping price list extras by name", async () => {
    const grooming = await as(db, user(k.owner), async () =>
      (await db.query<{ id: string }>("insert into public.services (org_id, kind, name, unit, price_minor) values ($1, 'addon', 'Grooming', 'each', 50000) returning id", [k.org])).rows[0].id,
    );
    const b1 = await book(db, k, { pet: k.pets[0], start: "2027-06-01", end: "2027-06-03", kennel: k.kennels[0] });
    const b2 = await book(db, k, { pet: k.pets[1], start: "2027-06-02", end: "2027-06-04", kennel: k.kennels[1] });
    const gone = await book(db, k, { pet: k.pets[2], start: "2027-06-02", end: "2027-06-04", status: "cancelled" });
    await as(db, user(manager), async () => {
      const item = "insert into public.booking_items (org_id, booking_id, service_id, description, quantity, unit_price_minor) values ($1, $2, $3, $4, $5, $6)";
      await db.query(item, [k.org, b1, grooming, "Grooming", 1, 50000]);
      await db.query(item, [k.org, b2, grooming, "Bath and brush", 1, 50000]);
      await db.query(item, [k.org, gone, grooming, "Grooming", 1, 50000]);
      await db.query(item, [k.org, b1, null, "Vet visit", 1, 120000]);
    });
    const rows = await run<{ name: string; stays: number; quantity: string; amount_minor: number }>(k.owner, "report_extras", k.org, "2027-06-01", "2027-06-30");
    expect(rows.map((r) => [r.name, r.stays, Number(r.quantity), Number(r.amount_minor)])).toEqual([
      ["Vet visit", 1, 1, 120000],
      ["Grooming", 2, 2, 100000],
    ]);
  });
});

describe("receipts", () => {
  it("are for owners and managers only, while staff keep every other file", async () => {
    const receipt = `${k.org}/expenses/one.jpg`;
    const e = await errorOf(() => as(db, user(staff), () => db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [receipt])));
    expect(e.code).toBe("42501");
    await as(db, user(manager), () => db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [receipt]));
    await as(db, user(staff), () => db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [`${k.org}/pets/x/profile.jpg`]));

    const seen = (who: string) =>
      as(db, user(who), async () => (await db.query<{ name: string }>("select name from storage.objects order by name")).rows.map((r) => r.name));
    expect(await seen(staff)).toEqual([`${k.org}/pets/x/profile.jpg`]);
    expect(await seen(manager)).toEqual([receipt, `${k.org}/pets/x/profile.jpg`]);
  });
});
