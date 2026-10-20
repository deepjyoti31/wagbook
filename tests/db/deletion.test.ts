import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";

/**
 * Deleting is for owners (D29): managers run the kennel, but only an owner
 * removes a record, a file or a person. Row level security makes a manager's
 * delete touch nothing, and erasing a parent says why (WB074).
 */

let db: PGlite;
let k: Kennel;
let manager: string;
let staff: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 2, pets: 2 });
  manager = await addMember(db, k, "manager");
  staff = await addMember(db, k, "staff");
});
afterAll(() => db.close());

/** Insert as the owner and return the new row's id. */
const insert = (sql: string, params: unknown[]) =>
  as(db, user(k.owner), async () => (await db.query<{ id: string }>(`${sql} returning id`, params)).rows[0].id);

const deleted = async (actor: string, table: string, id: string) =>
  as(db, user(actor), async () => (await db.query(`delete from public.${table} where id = $1 returning id`, [id])).rows.length === 1);

describe("deleting", () => {
  it("is refused to managers and staff, and allowed to owners, for every kind of record", async () => {
    const booking = await book(db, k, { pet: k.pets[0], start: "2027-05-01", end: "2027-05-03" });
    const rows: [string, string][] = [
      ["expenses", await insert("insert into public.expenses (org_id, spent_on, category, amount_minor) values ($1, '2027-05-01', 'Food', 50000)", [k.org])],
      ["invoices", await insert("insert into public.invoices (org_id, client_id) values ($1, $2)", [k.org, k.client])],
      ["booking_items", await insert("insert into public.booking_items (org_id, booking_id, description, unit_price_minor) values ($1, $2, 'Bath', 50000)", [k.org, booking])],
      ["peak_periods", await insert("insert into public.peak_periods (org_id, name, start_date, end_date) values ($1, 'Diwali', '2027-11-01', '2027-11-05')", [k.org])],
      ["incidents", await insert("insert into public.incidents (org_id, pet_id, category, description) values ($1, $2, 'other', 'Barked')", [k.org, k.pets[0]])],
      ["kennels", await insert("insert into public.kennels (org_id, name) values ($1, 'Spare')", [k.org])],
    ];
    for (const [table, id] of rows) {
      expect(await deleted(manager, table, id), `${table} by a manager`).toBe(false);
      expect(await deleted(staff, table, id), `${table} by staff`).toBe(false);
      expect(await deleted(k.owner, table, id), `${table} by the owner`).toBe(true);
    }
  });

  it("keeps a person removed only by an owner, though anyone may leave", async () => {
    const other = await addMember(db, k, "staff");
    const remove = (actor: string, who: string) =>
      as(db, user(actor), async () => (await db.query("delete from public.memberships where org_id = $1 and user_id = $2 returning user_id", [k.org, who])).rows.length);
    expect(await remove(manager, other)).toBe(0);
    expect(await remove(k.owner, other)).toBe(1);
    const leaving = await addMember(db, k, "staff");
    expect(await remove(leaving, leaving)).toBe(1);
  });

  it("keeps files deleted only by an owner", async () => {
    const name = `${k.org}/expenses/receipt-1.jpg`;
    await as(db, user(k.owner), () => db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [name]));
    const remove = (actor: string) => as(db, user(actor), async () => (await db.query("delete from storage.objects where name = $1 returning name", [name])).rows.length);
    expect(await remove(manager)).toBe(0);
    expect(await remove(k.owner)).toBe(1);
  });

  it("lets a manager download a parent's details, but only an owner erase them", async () => {
    await as(db, user(manager), () => db.query("select public.export_client($1)", [k.client]));
    expect((await errorOf(() => as(db, user(manager), () => db.query("select public.erase_client($1)", [k.client])))).message).toContain("WB074");
  });
});
