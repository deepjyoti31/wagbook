import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeInvoice } from "../../src/lib/core";
import { addMember, book, inviteMember, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { anon, as, createTestDb, createUser, errorOf, user } from "./harness";

/**
 * Regression tests for the adversarial review of 8 October 2026.
 * Each test is an attack that worked before the fix. See docs/05-security-and-privacy.md,
 * "Review log". Do not delete a test here without reading that section.
 */

let db: PGlite;
let k: Kennel;
let staff: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 3, pets: 4 });
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
});
afterAll(() => db.close());

const sql = <T>(actor: string, text: string, params: unknown[] = []) => as(db, user(actor), () => db.query<T>(text, params));
const fails = (actor: string, text: string, params: unknown[] = []) => errorOf(() => sql(actor, text, params));

async function issuedInvoice(k0: Kennel, booking: string | null = null): Promise<string> {
  const t = computeInvoice([{ description: "Boarding", quantity: 3, unitPriceMinor: 120000 }], { mode: "none" }, { roundToWholeUnit: true });
  return as(db, user(k0.owner), async () => {
    const inv = await db.query<{ id: string }>(
      "insert into public.invoices (org_id, client_id, booking_id, subtotal_minor, taxable_minor, total_minor) values ($1, $2, $3, $4, $5, $6) returning id",
      [k0.org, k0.client, booking, t.subtotalMinor, t.taxableMinor, t.totalMinor],
    );
    const l = t.lines[0];
    await db.query(
      "insert into public.invoice_lines (org_id, invoice_id, description, quantity, unit_price_minor, taxable_minor, total_minor) values ($1, $2, $3, $4, $5, $6, $7)",
      [k0.org, inv.rows[0].id, l.description, l.quantity, l.unitPriceMinor, l.taxableMinor, l.totalMinor],
    );
    await db.query("select public.issue_invoice($1)", [inv.rows[0].id]);
    return inv.rows[0].id;
  });
}

describe("invoices", () => {
  it("cannot be voided by staff with a plain update", async () => {
    const id = await issuedInvoice(k);
    expect((await fails(staff, "update public.invoices set status = 'void' where id = $1", [id])).code).toBe("42501");
    expect((await fails(manager, "update public.invoices set status = 'void' where id = $1", [id])).code).toBe("42501");
    const row = await db.query<{ status: string }>("select status from public.invoices where id = $1", [id]);
    expect(row.rows[0].status).toBe("issued");
  });

  it("cannot have their next number squatted by a draft", async () => {
    const e = await fails(staff, "insert into public.invoices (org_id, client_id, fiscal_year, seq) values ($1, $2, '2026-27', 9999)", [k.org, k.client]);
    expect(e.code).toBe("42501");
    // Even the database owner cannot store a numbered draft.
    const e2 = await errorOf(() => db.query("insert into public.invoices (org_id, client_id, seq, fiscal_year) values ($1, $2, 9999, '2026-27')", [k.org, k.client]));
    expect(e2.message).toContain("invoices_numbered_once_issued");
  });

  it("cannot be created with a chosen link token, void fields or author", async () => {
    for (const cols of ["public_token", "voided_at", "void_reason", "created_by", "issued_by", "seller", "currency"]) {
      const value = cols === "voided_at" ? "now()" : cols === "seller" ? "'{}'::jsonb" : cols.endsWith("_by") ? `'${k.owner}'` : cols === "currency" ? "'USD'" : "repeat('b', 64)";
      const e = await fails(staff, `insert into public.invoices (org_id, client_id, ${cols}) values ($1, $2, ${value})`, [k.org, k.client]);
      expect(e.code, cols).toBe("42501");
    }
  });

  it("freeze where to pay when issued", async () => {
    await sql(k.owner, "update public.organizations set upi_vpa = 'real@okbank' where id = $1", [k.org]);
    const id = await issuedInvoice(k);
    await sql(manager, "update public.organizations set upi_vpa = 'thief@okbank' where id = $1", [k.org]);
    const token = (await db.query<{ public_token: string }>("select public_token from public.invoices where id = $1", [id])).rows[0].public_token;
    await as(db, anon, async () => {
      const v = (await db.query<{ v: { upi: { vpa: string } } }>("select public.get_public_invoice($1) as v", [token])).rows[0].v;
      expect(v.upi.vpa).toBe("real@okbank");
    });
  });

  it("survive their booking being deleted", async () => {
    const bookingId = await book(db, k, { pet: k.pets[3], start: "2028-01-10", end: "2028-01-13" });
    const id = await issuedInvoice(k, bookingId);
    await sql(k.owner, "delete from public.bookings where id = $1", [bookingId]);
    const row = await db.query<{ status: string; booking_id: string | null }>("select status, booking_id from public.invoices where id = $1", [id]);
    expect(row.rows[0]).toEqual({ status: "issued", booking_id: null });
  });
});

describe("people", () => {
  it("join only by accepting an invitation", async () => {
    const invited = await inviteMember(db, k, "staff");
    // Invited but not accepted: sees no data, but does see the invitation.
    await as(db, user(invited), async () => {
      expect((await db.query("select 1 from public.clients")).rows).toHaveLength(0);
      const inv = await db.query<{ org_id: string; org_name: string; role: string }>("select org_id, org_name, role from public.my_invitations()");
      expect(inv.rows).toEqual([{ org_id: k.org, org_name: expect.stringContaining("Test Kennel"), role: "staff" }]);
    });
    // Nobody else can switch them on.
    const force = await fails(k.owner, "update public.memberships set is_active = true where org_id = $1 and user_id = $2", [k.org, invited]);
    expect(force.message).toContain("memberships_active_needs_acceptance");
    // They cannot switch themselves on by writing the row either.
    await as(db, user(invited), async () => {
      const upd = await db.query("update public.memberships set is_active = true where user_id = $1", [invited]);
      expect(upd.affectedRows).toBe(0);
    });
    await sql(invited, "select public.respond_to_invitation($1, true)", [k.org]);
    await as(db, user(invited), async () => {
      expect((await db.query("select 1 from public.clients")).rows.length).toBeGreaterThan(0);
      expect((await db.query("select 1 from public.my_invitations()")).rows).toHaveLength(0);
    });
    expect((await fails(invited, "select public.respond_to_invitation($1, true)", [k.org])).message).toContain("WB015");
  });

  it("can decline, and can leave later", async () => {
    const declined = await inviteMember(db, k, "staff");
    await sql(declined, "select public.respond_to_invitation($1, false)", [k.org]);
    expect((await db.query("select 1 from public.memberships where user_id = $1", [declined])).rows).toHaveLength(0);

    const leaver = await addMember(db, k, "staff");
    await as(db, user(leaver), async () => {
      expect((await db.query("delete from public.memberships where user_id = $1", [leaver])).affectedRows).toBe(1);
    });
  });

  it("cannot be reactivated by themselves once a manager has switched them off", async () => {
    const person = await addMember(db, k, "staff");
    await sql(k.owner, "update public.memberships set is_active = false where org_id = $1 and user_id = $2", [k.org, person]);
    expect((await fails(person, "select public.respond_to_invitation($1, true)", [k.org])).message).toContain("WB015");
    await as(db, user(person), async () => {
      expect((await db.query("update public.memberships set is_active = true where user_id = $1", [person])).affectedRows).toBe(0);
    });
  });

  it("an owner cannot be demoted or removed by a manager, by any route", async () => {
    const owner2 = await addMember(db, k, "owner");
    const email = (await db.query<{ email: string }>("select email from auth.users where id = $1", [owner2])).rows[0].email;
    expect((await fails(manager, "select public.invite_member_by_email($1, $2, 'staff', 'x')", [k.org, email])).message).toContain("WB002");
    await as(db, user(manager), async () => {
      expect((await db.query("delete from public.memberships where org_id = $1 and user_id = $2", [k.org, owner2])).affectedRows).toBe(0);
    });
    const role = await db.query<{ role: string }>("select role from public.memberships where org_id = $1 and user_id = $2", [k.org, owner2]);
    expect(role.rows[0].role).toBe("owner");
  });

  it("a membership cannot be pointed at another person, organisation or date", async () => {
    const stranger = await createUser(db, "target@example.test");
    for (const [col, value] of [["user_id", stranger], ["org_id", k.org], ["created_at", "2000-01-01"], ["accepted_at", "2000-01-01"]]) {
      const e = await fails(k.owner, `update public.memberships set ${col} = $1 where org_id = $2 and user_id = $3`, [value, k.org, staff]);
      expect(e.code, col).toBe("42501");
    }
  });

  it("inviting an unknown email looks exactly like inviting a known one", async () => {
    await sql(k.owner, "select public.invite_member_by_email($1, 'nobody-here@example.test', 'staff', 'Nobody')", [k.org]);
    expect((await db.query("select 1 from public.memberships m join auth.users u on u.id = m.user_id where u.email = 'nobody-here@example.test'")).rows).toHaveLength(0);
  });

  it("has every change recorded", async () => {
    await sql(k.owner, "update public.organizations set city = 'Bengaluru' where id = $1", [k.org]);
    await as(db, user(k.owner), async () => {
      const log = await db.query<{ table_name: string }>("select distinct table_name from public.audit_log where org_id = $1", [k.org]);
      expect(log.rows.map((r) => r.table_name)).toEqual(expect.arrayContaining(["organizations", "memberships"]));
    });
  });
});

describe("rows stay in their organisation", () => {
  it("cannot be moved to another organisation the user also belongs to", async () => {
    // The staff member creates an organisation of their own, then tries to carry rows off to it.
    const mine = await as(db, user(staff), async () =>
      (await db.query<{ id: string }>("select public.create_organization('Side Kennel', 'side-kennel', 'Me') as id")).rows[0].id,
    );
    const lone = await as(db, user(k.owner), async () =>
      (await db.query<{ id: string }>("insert into public.clients (org_id, full_name, phone) values ($1, 'Lone', '+919111100000') returning id", [k.org])).rows[0].id,
    );
    expect((await fails(staff, "update public.clients set org_id = $1 where id = $2", [mine, lone])).message).toContain("WB004");
    // The same holds for a table reached through a different policy.
    expect((await fails(staff, "update public.pets set org_id = $1 where id = $2", [mine, k.pets[0]])).message).toMatch(/WB004|23503/);
    const still = await db.query<{ org_id: string }>("select org_id from public.pets where id = $1", [k.pets[0]]);
    expect(still.rows[0].org_id).toBe(k.org);
  });

  it("cannot point at another organisation's rate card or routines", async () => {
    const other = await seedKennel(db);
    const svc = await as(db, user(other.owner), async () =>
      (await db.query<{ id: string }>("insert into public.services (org_id, kind, name, price_minor) values ($1, 'addon', 'Theirs', 100) returning id", [other.org])).rows[0].id,
    );
    const item = await as(db, user(other.owner), async () =>
      (await db.query<{ id: string }>("insert into public.care_items (org_id, kind, label, due_time) values ($1, 'meal', 'Theirs', '09:00') returning id", [other.org])).rows[0].id,
    );
    const bookingId = await book(db, k, { pet: k.pets[0], start: "2028-02-01", end: "2028-02-03" });
    // As the owner, so the price guard (which refuses staff first) does not hide what the foreign key does.
    expect((await fails(k.owner, "insert into public.booking_items (org_id, booking_id, service_id, description, unit_price_minor) values ($1, $2, $3, 'x', 1)", [k.org, bookingId, svc])).code).toBe("23503");
    expect((await fails(staff, "insert into public.care_tasks (org_id, booking_id, pet_id, care_item_id, task_date, kind, label) values ($1, $2, $3, $4, '2028-02-01', 'meal', 'x')", [k.org, bookingId, k.pets[0], item])).code).toBe("23503");
  });
});

describe("who did it cannot be forged", () => {
  it("on payments, bookings, tasks, updates and incidents", async () => {
    const bookingId = await book(db, k, { pet: k.pets[1], start: "2028-03-01", end: "2028-03-04", kennel: k.kennels[0] });

    // The staff member names the owner as the actor everywhere they can.
    await sql(staff, "insert into public.payments (org_id, client_id, amount_minor, method, received_on, recorded_by) values ($1, $2, 100, 'cash', '2028-03-01', $3)", [k.org, k.client, k.owner]);
    expect((await fails(staff, "update public.bookings set status = 'checked_in', checked_in_by = $1, checked_in_at = '2001-01-01' where id = $2", [k.owner, bookingId])).code).toBe("42501");
    await sql(staff, "update public.bookings set status = 'checked_in' where id = $1", [bookingId]);
    await sql(staff, "insert into public.care_tasks (org_id, booking_id, pet_id, task_date, kind, label, status, done_by, done_at) values ($1, $2, $3, '2028-03-01', 'walk', 'Walk', 'done', $4, '2001-01-01')", [k.org, bookingId, k.pets[1], k.owner]);
    await sql(staff, "insert into public.stay_updates (org_id, booking_id, pet_id, body, created_by) values ($1, $2, $3, 'hello', $4)", [k.org, bookingId, k.pets[1], k.owner]);
    await sql(staff, "insert into public.incidents (org_id, pet_id, category, description, created_by) values ($1, $2, 'other', 'x', $3)", [k.org, k.pets[1], k.owner]);

    const who = async (q: string) => (await db.query<{ who: string }>(q, [k.org])).rows[0].who;
    expect(await who("select recorded_by as who from public.payments where org_id = $1 and amount_minor = 100")).toBe(staff);
    expect(await who("select checked_in_by as who from public.bookings where org_id = $1 and start_date = '2028-03-01'")).toBe(staff);
    expect(await who("select done_by as who from public.care_tasks where org_id = $1 and label = 'Walk'")).toBe(staff);
    expect(await who("select created_by as who from public.stay_updates where org_id = $1 and body = 'hello'")).toBe(staff);
    expect(await who("select created_by as who from public.incidents where org_id = $1 and description = 'x'")).toBe(staff);
    const at = await db.query<{ ok: boolean }>("select done_at > now() - interval '1 hour' as ok from public.care_tasks where label = 'Walk'");
    expect(at.rows[0].ok).toBe(true);

    // And the author cannot be rewritten afterwards.
    await sql(manager, "update public.stay_updates set created_by = $1, body = 'edited' where org_id = $2 and body = 'hello'", [k.owner, k.org]);
    expect(await who("select created_by as who from public.stay_updates where org_id = $1 and body = 'edited'")).toBe(staff);
  });

  it("and the stay link token cannot be chosen", async () => {
    const e = await fails(staff, "update public.bookings set public_token = repeat('b', 64) where org_id = $1", [k.org]);
    expect(e.code).toBe("42501");
  });
});

describe("space", () => {
  let s: Kennel;
  beforeAll(async () => {
    s = await seedKennel(db, { kennels: 2, pets: 4 });
  });

  it("is held by day boarding through its last day", async () => {
    await book(db, s, { pet: s.pets[0], start: "2027-07-05", end: "2027-07-07", kennel: s.kennels[0], kind: "daycare" });
    // Another parent's pet in the same kennel on the last day: refused.
    const other = await strangerPet(db, s);
    expect((await errorOf(() => book(db, s, { pet: other, start: "2027-07-07", end: "2027-07-07", kennel: s.kennels[0], kind: "daycare" }))).message).toContain("bookings_no_kennel_overlap");
    // The same pet again on its own last day: refused.
    expect((await errorOf(() => book(db, s, { pet: s.pets[0], start: "2027-07-07", end: "2027-07-09" }))).message).toContain("bookings_no_pet_overlap");
    // The day after is free.
    await book(db, s, { pet: s.pets[1], start: "2027-07-08", end: "2027-07-08", kennel: s.kennels[0], kind: "daycare" });
    await as(db, user(s.owner), async () => {
      const occ = await db.query<{ occupied: number }>("select occupied from public.occupancy_by_day($1, '2027-07-04', '2027-07-09')", [s.org]);
      expect(occ.rows.map((r) => r.occupied)).toEqual([0, 1, 1, 1, 1, 0]);
      const free = await db.query<{ name: string }>("select name from public.available_kennels($1, 'daycare', '2027-07-07', '2027-07-07')", [s.org]);
      expect(free.rows.map((r) => r.name)).toEqual(["K02"]);
    });
    // Capacity counts the last day too: two kennels, so a third pet on the 7th is refused.
    await book(db, s, { pet: s.pets[2], start: "2027-07-07", end: "2027-07-07", kind: "daycare" });
    expect((await errorOf(() => book(db, s, { pet: s.pets[3], start: "2027-07-07", end: "2027-07-07", kind: "daycare" }))).message).toContain("WB020");
  });

  it("is not given in a kennel that is out of service", async () => {
    await as(db, user(s.owner), () => db.query("update public.kennels set is_active = false where id = $1", [s.kennels[1]]));
    expect((await errorOf(() => book(db, s, { pet: s.pets[3], start: "2027-09-01", end: "2027-09-02", kennel: s.kennels[1] }))).message).toContain("WB021");
    await as(db, user(s.owner), () => db.query("update public.kennels set is_active = true where id = $1", [s.kennels[1]]));
  });

  it("cannot be booked for more than a year, or for a pet that is not the client's", async () => {
    expect((await errorOf(() => book(db, s, { pet: s.pets[3], start: "2027-10-01", end: "2500-01-01" }))).message).toContain("bookings_at_most_a_year");
    const other = await as(db, user(s.owner), async () =>
      (await db.query<{ id: string }>("insert into public.clients (org_id, full_name, phone) values ($1, 'Other', '+919222200000') returning id", [s.org])).rows[0].id,
    );
    const e = await errorOf(() =>
      as(db, user(s.owner), () =>
        db.query("insert into public.bookings (org_id, client_id, pet_id, start_date, end_date, rate_minor) values ($1, $2, $3, '2027-11-01', '2027-11-02', 1)", [s.org, other, s.pets[3]]),
      ),
    );
    expect(e.code).toBe("23503");
  });

  it("clears the check-out stamp when a stay is reopened", async () => {
    const id = await book(db, s, { pet: s.pets[3], start: "2027-12-01", end: "2027-12-03" });
    for (const status of ["checked_in", "checked_out", "checked_in"]) {
      await as(db, user(s.owner), () => db.query("update public.bookings set status = $1 where id = $2", [status, id]));
    }
    const row = await db.query<{ checked_out_at: string | null; checked_in_at: string | null }>("select checked_out_at, checked_in_at from public.bookings where id = $1", [id]);
    expect(row.rows[0].checked_out_at).toBeNull();
    expect(row.rows[0].checked_in_at).not.toBeNull();
  });
});

describe("the intake form", () => {
  const payload = (over: Record<string, unknown>) =>
    JSON.stringify({ v: 1, parent: { name: "Known Parent", phone: "+919333300000" }, pets: [{ name: "Rex" }], stay: {}, consent: true, ...over });
  const submit = (slug: string, body: string) => as(db, anon, () => db.query("select public.submit_intake($1, $2::jsonb)", [slug, body]));
  let slug: string;
  let i: Kennel;

  beforeAll(async () => {
    i = await seedKennel(db);
    slug = (await db.query<{ slug: string }>("select slug from public.organizations where id = $1", [i.org])).rows[0].slug;
  });

  it("cannot be accepted once declined", async () => {
    await submit(slug, payload({}));
    const id = (await db.query<{ id: string }>("select id from public.intake_submissions where org_id = $1", [i.org])).rows[0].id;
    await sql(i.owner, "update public.intake_submissions set status = 'spam' where id = $1", [id]);
    expect((await fails(i.owner, "select public.accept_intake($1)", [id])).message).toContain("WB049");
  });

  it("cannot rewrite a known client, and survives junk dates and oversized text", async () => {
    await sql(i.owner, "insert into public.clients (org_id, full_name, phone, consent_at, consent_source) values ($1, 'Real Name', '+919333300001', null, null)", [i.org]);
    await submit(slug, payload({
      parent: { name: "Impostor", phone: "+919333300001" },
      pets: [{ name: "Rex", date_of_birth: "2024-13-45", weight_kg: "1e9", medical_notes: "m".repeat(15000), vaccinations: [{ vaccine: "rabies", given_on: "2027-02-30", valid_until: "2020-01-01" }] }],
    }));
    const id = (await db.query<{ id: string }>("select id from public.intake_submissions where parent_phone = '+919333300001'")).rows[0].id;
    const clientId = (await sql<{ id: string }>(i.owner, "select public.accept_intake($1) as id", [id])).rows[0].id;

    const client = await db.query<{ full_name: string; consent_source: string | null }>("select full_name, consent_source from public.clients where id = $1", [clientId]);
    expect(client.rows[0]).toEqual({ full_name: "Real Name", consent_source: null });
    const pet = await db.query<{ date_of_birth: string | null; weight_g: number | null; len: number }>(
      "select date_of_birth, weight_g, char_length(medical_notes) as len from public.pets where client_id = $1", [clientId],
    );
    expect(pet.rows[0]).toEqual({ date_of_birth: null, weight_g: null, len: 2000 });
  });

  it("answers a malformed consent value with its own error, not a database one", async () => {
    expect((await errorOf(() => submit(slug, payload({ consent: "abc" })))).message).toContain("WB042");
  });

  it("reopens as soon as the kennel clears a flood", async () => {
    await db.exec(`insert into public.intake_submissions (org_id, parent_name, parent_phone, payload, consent_at, consent_text)
                   select '${i.org}', 'Flood', '+9194444' || lpad(g::text, 5, '0'), '{}'::jsonb, now(), 'x' from generate_series(1, 60) g`);
    expect((await errorOf(() => submit(slug, payload({ parent: { name: "Honest Parent", phone: "+919555500000" } })))).message).toContain("WB048");
    await sql(i.owner, "update public.intake_submissions set status = 'spam' where org_id = $1 and parent_name = 'Flood'", [i.org]);
    await submit(slug, payload({ parent: { name: "Honest Parent", phone: "+919555500000" } }));
  });
});

describe("parent links", () => {
  it("stop working for a no-show and for a deleted pet", async () => {
    const p = await seedKennel(db);
    const a = await book(db, p, { pet: p.pets[0], start: "2028-05-01", end: "2028-05-03" });
    const b = await book(db, p, { pet: p.pets[1], start: "2028-05-01", end: "2028-05-03" });
    const token = async (id: string) => (await db.query<{ public_token: string }>("select public_token from public.bookings where id = $1", [id])).rows[0].public_token;
    const visible = async (t: string) => as(db, anon, async () => (await db.query<{ v: unknown }>("select public.get_public_stay($1) as v", [t])).rows[0].v !== null);

    expect(await visible(await token(a))).toBe(true);
    await sql(p.owner, "update public.bookings set status = 'no_show' where id = $1", [a]);
    expect(await visible(await token(a))).toBe(false);

    expect(await visible(await token(b))).toBe(true);
    // The app refuses to hide a pet with a stay to come (WB019), so hide it the way only the database's own
    // maintenance could: the stay page must still stop showing it.
    await db.query("update public.pets set deleted_at = now() where id = $1", [p.pets[1]]);
    expect(await visible(await token(b))).toBe(false);
  });
});

describe("stored files", () => {
  it("can be added by staff but not replaced or renamed", async () => {
    await sql(staff, "insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [`${k.org}/vaccinations/cert.pdf`]);
    await as(db, user(staff), async () => {
      const upd = await db.query("update storage.objects set name = $1 where name = $2", [`${k.org}/vaccinations/other.pdf`, `${k.org}/vaccinations/cert.pdf`]);
      expect(upd.affectedRows).toBe(0);
    });
    await as(db, user(manager), async () => {
      const upd = await db.query("update storage.objects set name = $1 where name = $2", [`${k.org}/vaccinations/renamed.pdf`, `${k.org}/vaccinations/cert.pdf`]);
      expect(upd.affectedRows).toBe(1);
    });
  });
});

/**
 * Second pass, 8 October 2026: found while checking the documentation against
 * the code. See docs/05-security-and-privacy.md, "Review log".
 */
describe("second pass", () => {
  let s: Kennel;
  let sStaff: string;
  let sManager: string;

  beforeAll(async () => {
    s = await seedKennel(db, { kennels: 2, pets: 3 });
    sStaff = await addMember(db, s, "staff");
    sManager = await addMember(db, s, "manager");
  });

  const emailOf = async (id: string) => (await db.query<{ email: string }>("select email from auth.users where id = $1", [id])).rows[0].email;
  const roleOf = async (id: string) =>
    (await db.query<{ role: string }>("select role from public.memberships where org_id = $1 and user_id = $2", [s.org, id])).rows[0].role;

  it("a second invitation never changes someone who is already a member", async () => {
    const other = await addMember(db, s, "manager");
    // A manager "invites" a fellow manager as staff, and an owner "invites" a manager as staff: neither is a demotion.
    await sql(sManager, "select public.invite_member_by_email($1, $2, 'staff', 'Demoted')", [s.org, await emailOf(other)]);
    await sql(s.owner, "select public.invite_member_by_email($1, $2, 'staff', 'Demoted')", [s.org, await emailOf(other)]);
    expect(await roleOf(other)).toBe("manager");
    const name = await db.query<{ display_name: string }>("select display_name from public.memberships where org_id = $1 and user_id = $2", [s.org, other]);
    expect(name.rows[0].display_name).not.toBe("Demoted");
  });

  it("an unanswered invitation can still be corrected", async () => {
    const pending = await inviteMember(db, s, "staff");
    await sql(s.owner, "select public.invite_member_by_email($1, $2, 'manager', 'Corrected')", [s.org, await emailOf(pending)]);
    expect(await roleOf(pending)).toBe("manager");
  });

  it("records who added a parent and an extra, whatever the client claims", async () => {
    await sql(sStaff, "insert into public.clients (org_id, full_name, phone, created_by) values ($1, 'Claimed', '+919666600001', $2)", [s.org, s.owner]);
    const bookingId = await book(db, s, { pet: s.pets[0], start: "2029-01-10", end: "2029-01-12" });
    await sql(sStaff, "insert into public.booking_items (org_id, booking_id, description, unit_price_minor, created_by) values ($1, $2, 'Groom', 200000, $3)", [s.org, bookingId, s.owner]);
    await sql(sStaff, "update public.clients set created_by = $1 where phone = '+919666600001'", [s.owner]);

    const client = await db.query<{ created_by: string }>("select created_by from public.clients where phone = '+919666600001'");
    const item = await db.query<{ created_by: string }>("select created_by from public.booking_items where booking_id = $1", [bookingId]);
    expect(client.rows[0].created_by).toBe(sStaff);
    expect(item.rows[0].created_by).toBe(sStaff);
  });

  it("records who checked a certificate and who told the parent, and when, from the session", async () => {
    await sql(sStaff, "insert into public.vaccinations (org_id, pet_id, vaccine, verified_by, verified_at) values ($1, $2, 'rabies', $3, '2001-01-01')", [s.org, s.pets[0], s.owner]);
    await sql(sStaff, "insert into public.incidents (org_id, pet_id, category, description) values ($1, $2, 'other', 'Limping')", [s.org, s.pets[0]]);
    await sql(sStaff, "update public.incidents set parent_notified_at = '2001-01-01', parent_notified_by = $1 where org_id = $2", [s.owner, s.org]);
    // A later edit by someone else must not take the credit or move the time.
    await sql(sManager, "update public.vaccinations set verified_by = $1, verified_at = '2002-02-02', notes = 'seen' where org_id = $2", [s.owner, s.org]);

    const vax = await db.query<{ verified_by: string; recent: boolean }>("select verified_by, verified_at > now() - interval '1 hour' as recent from public.vaccinations where org_id = $1", [s.org]);
    const inc = await db.query<{ parent_notified_by: string; recent: boolean }>("select parent_notified_by, parent_notified_at > now() - interval '1 hour' as recent from public.incidents where org_id = $1", [s.org]);
    expect(vax.rows[0]).toEqual({ verified_by: sStaff, recent: true });
    expect(inc.rows[0]).toEqual({ parent_notified_by: sStaff, recent: true });

    // Clearing the time clears the person too.
    await sql(sStaff, "update public.vaccinations set verified_at = null where org_id = $1", [s.org]);
    const cleared = await db.query<{ verified_by: string | null }>("select verified_by from public.vaccinations where org_id = $1", [s.org]);
    expect(cleared.rows[0].verified_by).toBeNull();
  });

  it("a form is reviewed once: it cannot be reopened, re-attributed or edited", async () => {
    const slug = (await db.query<{ slug: string }>("select slug from public.organizations where id = $1", [s.org])).rows[0].slug;
    await as(db, anon, () =>
      db.query("select public.submit_intake($1, $2::jsonb)", [slug, JSON.stringify({ v: 1, parent: { name: "Pia Parent", phone: "+919777700001" }, pets: [{ name: "Rex" }], stay: {}, consent: true })]),
    );
    const id = (await db.query<{ id: string }>("select id from public.intake_submissions where org_id = $1", [s.org])).rows[0].id;

    // What the parent sent is not editable, and nor is the reviewer.
    expect((await fails(sStaff, "update public.intake_submissions set payload = '{}'::jsonb where id = $1", [id])).code).toBe("42501");
    expect((await fails(sStaff, "update public.intake_submissions set parent_name = 'Other' where id = $1", [id])).code).toBe("42501");
    expect((await fails(sStaff, "update public.intake_submissions set reviewed_by = $1 where id = $2", [s.owner, id])).code).toBe("42501");

    await sql(sStaff, "update public.intake_submissions set status = 'rejected' where id = $1", [id]);
    const row = await db.query<{ reviewed_by: string; reviewed_at: string | null }>("select reviewed_by, reviewed_at from public.intake_submissions where id = $1", [id]);
    expect(row.rows[0].reviewed_by).toBe(sStaff);
    expect(row.rows[0].reviewed_at).not.toBeNull();

    // Declined is final, for everyone.
    expect((await fails(s.owner, "update public.intake_submissions set status = 'new' where id = $1", [id])).message).toContain("WB049");
    expect((await fails(s.owner, "select public.accept_intake($1)", [id])).message).toContain("WB049");
  });

  it("numbers the ten thousandth invoice of a year correctly", async () => {
    const first = (await db.query<{ number: string; fiscal_year: string }>("select number, fiscal_year from public.invoices where id = $1", [await issuedInvoice(s)])).rows[0];
    expect(first.number.endsWith("/0001")).toBe(true);
    await db.query("update public.invoice_counters set last_seq = 9999 where org_id = $1 and fiscal_year = $2", [s.org, first.fiscal_year]);
    const big = (await db.query<{ number: string; seq: number }>("select number, seq from public.invoices where id = $1", [await issuedInvoice(s)])).rows[0];
    expect(big.seq).toBe(10000);
    expect(big.number.endsWith("/10000")).toBe(true);
    expect(big.number.length).toBeLessThanOrEqual(16);
  });

  it("a stay link stops working 30 days after check-out", async () => {
    const bookingId = await book(db, s, { pet: s.pets[1], start: "2029-02-01", end: "2029-02-03", kennel: s.kennels[0] });
    await sql(sStaff, "update public.bookings set status = 'checked_in' where id = $1", [bookingId]);
    await sql(sStaff, "update public.bookings set status = 'checked_out' where id = $1", [bookingId]);
    const token = (await db.query<{ public_token: string }>("select public_token from public.bookings where id = $1", [bookingId])).rows[0].public_token;
    const open = () => as(db, anon, async () => (await db.query<{ v: unknown }>("select public.get_public_stay($1) as v", [token])).rows[0].v);

    expect(await open()).not.toBeNull();
    // The stamp is not writable through the API, so age it as the database owner. The audit trigger needs no user for that.
    await db.query("alter table public.bookings disable trigger user");
    await db.query("update public.bookings set checked_out_at = now() - interval '31 days' where id = $1", [bookingId]);
    await db.query("alter table public.bookings enable trigger user");
    expect(await open()).toBeNull();
  });

  it("moving a booking to another kennel is checked like a new booking", async () => {
    const a = await book(db, s, { pet: s.pets[0], start: "2029-03-01", end: "2029-03-04", kennel: s.kennels[0] });
    const b = await book(db, s, { pet: await strangerPet(db, s), start: "2029-03-02", end: "2029-03-05", kennel: s.kennels[1] });
    // Only the kennel changes: into one that is taken, then into one that is out of service.
    expect((await fails(sStaff, "update public.bookings set kennel_id = $1 where id = $2", [s.kennels[0], b])).message).toContain("bookings_no_kennel_overlap");
    await sql(sStaff, "update public.bookings set status = 'cancelled' where id = $1", [a]);
    await sql(s.owner, "update public.kennels set is_active = false where id = $1", [s.kennels[0]]);
    expect((await fails(sStaff, "update public.bookings set kennel_id = $1 where id = $2", [s.kennels[0], b])).message).toContain("WB021");
  });
});
