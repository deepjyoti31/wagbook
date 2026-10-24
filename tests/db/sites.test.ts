import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { combineSites, computeInvoice, type SiteFigures } from "../../src/lib/core";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { anon, as, createOrg, createTestDb, createUser, errorOf, user } from "./harness";

/**
 * M65: several sites under one owner (D55). Each site is a kennel of its own;
 * report_sites() reads each one the owner owns and nothing else.
 */

let db: PGlite;
let north: Kennel;
let south: Kennel;
let southManager: string;

beforeAll(async () => {
  db = await createTestDb();
  north = await seedKennel(db, { kennels: 4, pets: 2 });
  south = await secondSite(north.owner, 2);
  southManager = await addMember(db, south, "manager");
});
afterAll(() => db.close());

/** A second kennel created by the same owner, as "Create kennel" does, with kennels, a parent and a pet. */
async function secondSite(owner: string, kennels: number): Promise<Kennel> {
  const org = await createOrg(db, owner, "South Site", "south-site");
  return as(db, user(owner), async () => {
    const ids: string[] = [];
    for (let i = 1; i <= kennels; i++) {
      ids.push((await db.query<{ id: string }>("insert into public.kennels (org_id, name, sort_order) values ($1, $2, $3) returning id", [org, `S${i}`, i])).rows[0].id);
    }
    const client = (await db.query<{ id: string }>("insert into public.clients (org_id, full_name, phone) values ($1, 'South parent', '+919811122233') returning id", [org])).rows[0].id;
    const pet = (await db.query<{ id: string }>("insert into public.pets (org_id, client_id, name) values ($1, $2, 'Bruno') returning id", [org, client])).rows[0].id;
    return { owner, org, kennels: ids, client, pets: [pet] };
  });
}

type Row = {
  org_id: string; name: string; currency: string; nights: number; day_boarding_days: number; kennel_days: number; kennels_used: number;
  billed_minor: string; credited_minor: string; received_minor: string; refunded_minor: string; spent_minor: string; owed_minor: string; bills_owed: number;
};

function sites(actor: string, from = "2027-03-01", to = "2027-03-31") {
  return as(db, user(actor), async () => (await db.query<Row>("select * from public.report_sites($1, $2)", [from, to])).rows);
}

/** The rows as the app reads them (bigints arrive as text). */
const figures = (rows: Row[]): SiteFigures[] =>
  rows.map((r) => ({
    orgId: r.org_id, name: r.name, currency: r.currency, nights: r.nights, days: r.day_boarding_days, kennelDays: r.kennel_days, kennelsUsed: r.kennels_used,
    billedMinor: Number(r.billed_minor), creditedMinor: Number(r.credited_minor), receivedMinor: Number(r.received_minor), refundedMinor: Number(r.refunded_minor),
    spentMinor: Number(r.spent_minor), owedMinor: Number(r.owed_minor), billsOwed: r.bills_owed,
  }));

/** A bill with no tax for one amount, issued by the site's owner. */
async function issue(k: Kennel, amountMinor: number): Promise<string> {
  const t = computeInvoice([{ description: "Boarding", quantity: 1, unitPriceMinor: amountMinor, taxRateBp: 0 }], { mode: "none" }, { roundToWholeUnit: false });
  return as(db, user(k.owner), async () => {
    const id = (await db.query<{ id: string }>("insert into public.invoices (org_id, client_id) values ($1, $2) returning id", [k.org, k.client])).rows[0].id;
    const totals = {
      subtotal_minor: t.subtotalMinor, discount_minor: t.discountMinor, taxable_minor: t.taxableMinor, cgst_minor: 0, sgst_minor: 0, igst_minor: 0,
      tax_minor: 0, round_off_minor: t.roundOffMinor, total_minor: t.totalMinor,
    };
    const lines = t.lines.map((l, i) => ({
      sort_order: i, description: l.description, sac_code: null, quantity: l.quantity, unit_price_minor: l.unitPriceMinor, discount_minor: 0,
      taxable_minor: l.taxableMinor, tax_rate_bp: 0, cgst_minor: 0, sgst_minor: 0, igst_minor: 0, tax_minor: 0, total_minor: l.totalMinor,
    }));
    await db.query("select public.save_invoice_draft($1, $2, $3)", [id, JSON.stringify(totals), JSON.stringify(lines)]);
    await db.query("select public.issue_invoice($1)", [id]);
    return id;
  });
}

async function money(k: Kennel, sql: string, params: unknown[]) {
  await as(db, user(k.owner), () => db.query(sql, params));
}

describe("all sites for an owner of two", () => {
  beforeAll(async () => {
    // North: one dog for three nights and the other for two days of day boarding, in March.
    await book(db, north, { pet: north.pets[0], start: "2027-03-10", end: "2027-03-13", kennel: north.kennels[0] });
    await book(db, north, { pet: north.pets[1], start: "2027-03-20", end: "2027-03-21", kind: "daycare" });
    // South: one dog for five nights; a cancelled stay and a request count for nothing.
    const stay = await book(db, south, { pet: south.pets[0], start: "2027-03-01", end: "2027-03-06", kennel: south.kennels[0] });
    await book(db, south, { pet: south.pets[0], start: "2027-03-15", end: "2027-03-18", status: "cancelled" });
    await book(db, south, { pet: south.pets[0], start: "2027-03-25", end: "2027-03-28", status: "requested" });

    const pay = "insert into public.payments (org_id, client_id, invoice_id, direction, amount_minor, method, received_on) values ($1, $2, $3, $4, $5, 'upi', $6)";
    const spend = "insert into public.expenses (org_id, spent_on, category, amount_minor) values ($1, $2, 'Food', $3)";
    const northBill = await issue(north, 360000);
    await money(north, pay, [north.org, north.client, northBill, "in", 300000, "2027-03-14"]);
    await money(north, spend, [north.org, "2027-03-02", 50000]);
    // South: an advance on the stay, half of it refunded, and a bill of its own not paid yet.
    const advance = "insert into public.payments (org_id, client_id, booking_id, direction, amount_minor, method, received_on) values ($1, $2, $3, $4, $5, 'upi', $6)";
    await money(south, advance, [south.org, south.client, stay, "in", 200000, "2027-02-27"]);
    await money(south, advance, [south.org, south.client, stay, "out", 100000, "2027-03-08"]);
    await money(south, advance, [south.org, south.client, stay, "in", 200000, "2027-03-01"]);
    await issue(south, 600000);
    await money(south, spend, [south.org, "2027-03-05", 20000]);
    await money(south, spend, [south.org, "2027-04-01", 99900]);
  });

  it("gives each site from its own figures, and the combined totals", async () => {
    const rows = await sites(north.owner);
    expect(rows.map((r) => [r.name, r.nights, r.day_boarding_days, r.kennel_days, r.kennels_used])).toEqual([
      ["South Site", 5, 0, 2 * 31, 5],
      ["Test Kennel 1", 3, 2, 4 * 31, 5],
    ]);
    const south_ = rows.find((r) => r.org_id === south.org)!;
    const north_ = rows.find((r) => r.org_id === north.org)!;
    // Bills are issued today, so they count in March only when today is in March; the money moved by its own date.
    expect([north_.received_minor, north_.spent_minor, north_.owed_minor, north_.bills_owed].map(String)).toEqual(["300000", "50000", "60000", "1"]);
    expect([south_.received_minor, south_.refunded_minor, south_.spent_minor, south_.owed_minor, south_.bills_owed].map(String)).toEqual(["200000", "100000", "20000", "600000", "1"]);

    const [together] = combineSites(figures(rows));
    expect(together).toMatchObject({
      currency: "INR", sites: 2, nights: 8, days: 2, percentFull: Math.round((10 / (6 * 31)) * 100),
      receivedMinor: 500000, refundedMinor: 100000, spentMinor: 70000, netMinor: 330000, owedMinor: 660000, billsOwed: 2,
    });
  });

  it("counts a bill in the month it was issued", async () => {
    const today = (await db.query<{ d: string }>("select current_date::text as d")).rows[0].d;
    const month = today.slice(0, 7);
    const rows = await sites(north.owner, `${month}-01`, today);
    expect(rows.map((r) => [r.name, r.billed_minor].map(String))).toEqual([
      ["South Site", "600000"],
      ["Test Kennel 1", "360000"],
    ]);
  });
});

describe("who sees all sites", () => {
  it("refuses a manager, staff, a stranger and the anonymous role", async () => {
    const staff = await addMember(db, north, "staff");
    const stranger = await createUser(db, "wanders@example.test");
    for (const who of [southManager, staff, stranger]) {
      const e = await errorOf(() => sites(who));
      expect(e.message).toContain("WB062");
    }
    const e = await errorOf(() => as(db, anon, () => db.query("select * from public.report_sites('2027-03-01', '2027-03-31')")));
    expect(e.code).toBe("42501");
  });

  it("never shows a manager of one site the other's report", async () => {
    for (const fn of ["report_occupancy", "report_money"]) {
      const e = await errorOf(() => as(db, user(southManager), () => db.query(`select * from public.${fn}($1, '2027-03-01', '2027-03-31')`, [north.org])));
      expect(e.message).toContain("WB060");
    }
  });

  it("covers only the sites the reader owns, not one they manage", async () => {
    // The south site's manager owns a kennel of their own: all sites is that one only.
    const own = await createOrg(db, southManager, "Manager's Own", "managers-own");
    const rows = await sites(southManager);
    expect(rows.map((r) => r.org_id)).toEqual([own]);
  });

  it("refuses a period longer than about a year, as each site's report does", async () => {
    const e = await errorOf(() => sites(north.owner, "2027-01-01", "2028-03-01"));
    expect(e.message).toContain("WB061");
  });
});

describe("working at two sites", () => {
  it("lets staff of both read each site's day, one site at a time", async () => {
    const email = "both@example.test";
    const both = await createUser(db, email);
    for (const k of [north, south]) {
      await as(db, user(k.owner), () => db.query("select public.invite_member_by_email($1, $2, 'staff', 'Asha')", [k.org, email]));
      await as(db, user(both), () => db.query("select public.respond_to_invitation($1, true)", [k.org]));
    }
    await as(db, user(both), async () => {
      const mine = await db.query<{ org_id: string }>("select org_id from public.memberships where user_id = $1 and is_active order by created_at", [both]);
      expect(mine.rows.map((r) => r.org_id)).toEqual([north.org, south.org]);
      for (const k of [north, south]) {
        const pets = await db.query<{ org_id: string }>("select distinct org_id from public.pets where org_id = $1", [k.org]);
        expect(pets.rows.map((r) => r.org_id)).toEqual([k.org]);
      }
    });
  });
});

describe("how many sites one person may own", () => {
  it("lets an owner create ten kennels and refuses the eleventh", async () => {
    const owner = await createUser(db, "chain@example.test");
    for (let i = 1; i <= 10; i++) await createOrg(db, owner, `Chain ${i}`, `chain-${i}`);
    const e = await errorOf(() => createOrg(db, owner, "Chain 11", "chain-11"));
    expect(e.message).toContain("WB012");
  });
});
