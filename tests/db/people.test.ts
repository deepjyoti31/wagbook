import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { anon, as, createTestDb, createUser, errorOf, user } from "./harness";

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

const makeLink = (actor: string, role: string, name = "New person") =>
  as(db, user(actor), async () => (await db.query<{ t: string }>("select public.create_invitation_link($1, $2, $3) as t", [k.org, role, name])).rows[0].t);
const accept = (actor: string, token: string) =>
  as(db, user(actor), async () => (await db.query<{ o: string }>("select public.accept_invitation_link($1) as o", [token])).rows[0].o);

describe("invitation links, for someone with no account yet", () => {
  it("lets a manager make one, and whoever signs up with it joins in that role, once", async () => {
    const token = await makeLink(manager, "staff", "Arun");
    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const newcomer = await createUser(db, "arun@example.test");
    const seen = await as(db, user(newcomer), async () => (await db.query("select org_name, role, display_name, usable, already_member from public.get_invitation_link($1)", [token])).rows[0]);
    expect(seen).toEqual({ org_name: expect.any(String), role: "staff", display_name: "Arun", usable: true, already_member: false });

    expect(await accept(newcomer, token)).toBe(k.org);
    const m = await db.query<{ role: string; is_active: boolean; display_name: string }>("select role::text, is_active, display_name from public.memberships where user_id = $1", [newcomer]);
    expect(m.rows[0]).toEqual({ role: "staff", is_active: true, display_name: "Arun" });

    const second = await createUser(db, "forwarded@example.test");
    expect((await errorOf(() => accept(second, token))).message).toContain("WB016");
  });

  it("refuses staff, an owner link from a manager, a withdrawn or expired link, and a second join", async () => {
    expect((await errorOf(() => makeLink(staff, "staff"))).message).toContain("WB002");
    expect((await errorOf(() => makeLink(manager, "owner"))).message).toContain("WB002");
    await makeLink(k.owner, "owner");

    const withdrawn = await makeLink(manager, "staff");
    await as(db, user(manager), () => db.query("update public.invitation_links set revoked_at = now() where token = $1", [withdrawn]));
    const someone = await createUser(db, "late@example.test");
    expect((await errorOf(() => accept(someone, withdrawn))).message).toContain("WB016");

    const old = await makeLink(manager, "staff");
    await db.query("update public.invitation_links set expires_at = now() - interval '1 minute' where token = $1", [old]);
    expect((await errorOf(() => accept(someone, old))).message).toContain("WB016");

    const again = await makeLink(manager, "manager");
    expect((await errorOf(() => accept(staff, again))).message).toContain("WB017");
    // The refusal did not use up the link, or change the member's role.
    const role = await db.query<{ role: string }>("select role::text from public.memberships where org_id = $1 and user_id = $2", [k.org, staff]);
    expect(role.rows[0].role).toBe("staff");
  });

  it("is invisible to staff, other kennels and the anonymous role, and cannot be written directly", async () => {
    await makeLink(manager, "staff", "Hidden");
    const count = (actor: string) => as(db, user(actor), async () => (await db.query<{ n: number }>("select count(*)::int as n from public.invitation_links")).rows[0].n);
    expect(await count(staff)).toBe(0);
    expect(await count(manager)).toBeGreaterThan(0);
    const other = await seedKennel(db);
    expect(await count(other.owner)).toBe(0);
    expect((await errorOf(() => as(db, anon, () => db.query("select * from public.invitation_links")))).code).toBe("42501");
    expect(
      (await errorOf(() => as(db, user(manager), () => db.query("insert into public.invitation_links (org_id, role, display_name) values ($1, 'owner', 'x')", [k.org])))).code,
    ).toBe("42501");
    expect((await errorOf(() => as(db, user(manager), () => db.query("update public.invitation_links set used_at = now() where org_id = $1", [k.org])))).code).toBe("42501");
  });
});

describe("merging two parents who are the same person", () => {
  it("moves pets, stays, issued bills, payments and forms to the parent who stays, and hides the other", async () => {
    const dup = await as(db, user(k.owner), async () => {
      const c = await db.query<{ id: string }>(
        "insert into public.clients (org_id, full_name, phone, email, notes) values ($1, 'Same Person', '+919333300000', 'same@example.test', 'Prefers calls') returning id",
        [k.org],
      );
      const p = await db.query<{ id: string }>("insert into public.pets (org_id, client_id, name) values ($1, $2, 'Second dog') returning id", [k.org, c.rows[0].id]);
      return { client: c.rows[0].id, pet: p.rows[0].id };
    });
    const stay = await as(db, user(k.owner), async () =>
      (await db.query<{ id: string }>(
        "insert into public.bookings (org_id, client_id, pet_id, start_date, end_date, rate_minor) values ($1, $2, $3, '2028-01-01', '2028-01-03', 100000) returning id",
        [k.org, dup.client, dup.pet],
      )).rows[0].id,
    );
    const invoice = await as(db, user(k.owner), async () => {
      const i = await db.query<{ id: string }>(
        "insert into public.invoices (org_id, client_id, booking_id, subtotal_minor, taxable_minor, total_minor) values ($1, $2, $3, 200000, 200000, 200000) returning id",
        [k.org, dup.client, stay],
      );
      await db.query(
        "insert into public.invoice_lines (org_id, invoice_id, description, quantity, unit_price_minor, taxable_minor, total_minor) values ($1, $2, 'Stay', 2, 100000, 200000, 200000)",
        [k.org, i.rows[0].id],
      );
      await db.query("select public.issue_invoice($1)", [i.rows[0].id]);
      await db.query("insert into public.payments (org_id, client_id, invoice_id, amount_minor, method, received_on) values ($1, $2, $3, 50000, 'cash', '2028-01-03')", [
        k.org,
        dup.client,
        i.rows[0].id,
      ]);
      return i.rows[0].id;
    });

    // Staff cannot merge.
    expect((await errorOf(() => as(db, user(staff), () => db.query("select public.merge_clients($1, $2)", [k.client, dup.client])))).message).toContain("WB002");
    // Outside a merge, an issued bill's parent stays frozen.
    expect((await errorOf(() => as(db, user(k.owner), () => db.query("update public.invoices set client_id = $2 where id = $1", [invoice, k.client])))).message).toContain("WB032");

    await as(db, user(manager), () => db.query("select public.merge_clients($1, $2)", [k.client, dup.client]));

    const pet = await db.query<{ client_id: string }>("select client_id from public.pets where id = $1", [dup.pet]);
    const booking = await db.query<{ client_id: string }>("select client_id from public.bookings where id = $1", [stay]);
    const bill = await db.query<{ client_id: string; buyer: { name: string } }>("select client_id, buyer from public.invoices where id = $1", [invoice]);
    const paid = await db.query<{ client_id: string }>("select client_id from public.payments where invoice_id = $1", [invoice]);
    const kept = await db.query<{ email: string; notes: string; alt_phone: string }>("select email, notes, alt_phone from public.clients where id = $1", [k.client]);
    const gone = await db.query<{ deleted_at: string | null }>("select deleted_at from public.clients where id = $1", [dup.client]);
    expect([pet.rows[0].client_id, booking.rows[0].client_id, bill.rows[0].client_id, paid.rows[0].client_id]).toEqual([k.client, k.client, k.client, k.client]);
    // What was printed on the bill does not change.
    expect(bill.rows[0].buyer.name).toBe("Same Person");
    expect(kept.rows[0]).toEqual({ email: "same@example.test", notes: "Prefers calls", alt_phone: "+919333300000" });
    expect(gone.rows[0].deleted_at).not.toBeNull();
  });

  it("refuses the same parent twice and parents of two kennels", async () => {
    expect((await errorOf(() => as(db, user(k.owner), () => db.query("select public.merge_clients($1, $1)", [k.client])))).message).toContain("WB018");
    const other = await seedKennel(db);
    expect((await errorOf(() => as(db, user(k.owner), () => db.query("select public.merge_clients($1, $2)", [k.client, other.client])))).message).toContain("WB018");
  });
});

describe("people", () => {
  it("lets a manager suspend and restore staff, and change a name and role, but not touch an owner", async () => {
    const someone = await addMember(db, k, "staff");
    const set = (actor: string, sql: string, id: string) => as(db, user(actor), () => db.query(`update public.memberships set ${sql} where org_id = $1 and user_id = $2`, [k.org, id]));
    await set(manager, "is_active = false", someone);
    // Suspended: sees nothing.
    expect(await as(db, user(someone), async () => (await db.query("select * from public.bookings")).rows)).toEqual([]);
    await set(manager, "is_active = true, display_name = 'Meena R', role = 'manager'", someone);
    const m = await db.query("select role::text, is_active, display_name from public.memberships where user_id = $1", [someone]);
    expect(m.rows[0]).toEqual({ role: "manager", is_active: true, display_name: "Meena R" });

    await set(manager, "is_active = false", k.owner);
    const owner = await db.query<{ is_active: boolean }>("select is_active from public.memberships where org_id = $1 and user_id = $2", [k.org, k.owner]);
    expect(owner.rows[0].is_active).toBe(true);
    expect((await errorOf(() => set(manager, "role = 'owner'", someone))).code).toBe("42501");
  });

  it("keeps a booking's stay visible to a restored member", async () => {
    const b = await book(db, k, { pet: k.pets[0], start: "2028-06-01", end: "2028-06-03" });
    expect(await as(db, user(staff), async () => (await db.query("select id from public.bookings where id = $1", [b])).rows.length)).toBe(1);
  });
});
