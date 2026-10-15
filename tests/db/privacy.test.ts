import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { computeInvoice } from "../../src/lib/core";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { admin, anon, as, createTestDb, createUser, errorOf, user, userWithCode } from "./harness";

/**
 * Roadmap M9: two-step sign-in, a parent's export and erasure, and
 * certificates sent with the intake form.
 */

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
});
afterAll(() => db.close());

type Row = Record<string, unknown>;
/** The parts of export_client()'s document these tests read. */
interface Exported {
  format: string;
  parent: Row;
  pets: (Row & { id: string; vaccinations: Row[]; incidents: Row[] })[];
  stays: (Row & { updates: Row[] })[];
  bills: Row[];
  payments: Row[];
  files: string[];
}

const count = async (actor: ReturnType<typeof user>, sql: string, params: unknown[] = []) =>
  as(db, actor, async () => Number((await db.query<{ n: string }>(sql, params)).rows[0].n));

describe("two-step sign-in", () => {
  let k: Kennel;
  let staff: string;
  beforeAll(async () => {
    k = await seedKennel(db);
    staff = await addMember(db, k, "staff");
  });

  it("changes nothing for someone who has not turned it on, or has only started to", async () => {
    expect(await count(user(k.owner), "select count(*) as n from public.clients where org_id = $1", [k.org])).toBe(1);
    await as(db, admin, () => db.query("insert into auth.mfa_factors (user_id, status) values ($1, 'unverified')", [k.owner]));
    expect(await count(user(k.owner), "select count(*) as n from public.clients where org_id = $1", [k.org])).toBe(1);
  });

  it("once turned on, a session with only the password reaches nothing of the kennel", async () => {
    await as(db, admin, () => db.query("update auth.mfa_factors set status = 'verified' where user_id = $1", [k.owner]));
    const passwordOnly = user(k.owner);
    expect(await count(passwordOnly, "select count(*) as n from public.clients where org_id = $1", [k.org])).toBe(0);
    expect(await count(passwordOnly, "select count(*) as n from public.organizations")).toBe(0);
    expect(await count(passwordOnly, "select count(*) as n from public.memberships")).toBe(0);
    expect(await count(passwordOnly, "select count(*) as n from public.my_invitations()")).toBe(0);
    const write = await errorOf(() =>
      as(db, passwordOnly, () => db.query("insert into public.clients (org_id, full_name, phone) values ($1, 'X', '+919000000001')", [k.org])),
    );
    expect(write.message).toMatch(/row-level security/);
    for (const call of [
      "select public.create_organization('Side', 'side-kennel-mfa', 'Me')",
      "select public.set_my_language('hi')",
      "select public.respond_to_invitation(gen_random_uuid(), true)",
      "select public.accept_invitation_link(repeat('a', 64))",
    ]) {
      expect((await errorOf(() => as(db, passwordOnly, () => db.query(call)))).message, call).toContain("WB005");
    }
  });

  it("after the code, everything is back", async () => {
    expect(await count(userWithCode(k.owner), "select count(*) as n from public.clients where org_id = $1", [k.org])).toBe(1);
    expect(await count(userWithCode(k.owner), "select count(*) as n from public.memberships")).toBe(2);
  });

  it("is each person's own: colleagues without it are unaffected", async () => {
    expect(await count(user(staff), "select count(*) as n from public.clients where org_id = $1", [k.org])).toBe(1);
  });
});

describe("a parent's details", () => {
  let k: Kennel;
  let staff: string;
  let manager: string;
  let pastStay: string;
  let issuedNumber: string;
  let otherKennel: Kennel;

  beforeAll(async () => {
    k = await seedKennel(db, { pets: 2 });
    otherKennel = await seedKennel(db);
    staff = await addMember(db, k, "staff");
    manager = await addMember(db, k, "manager");
    pastStay = await book(db, k, { pet: k.pets[0], start: "2026-01-10", end: "2026-01-13", status: "checked_out" });
    await as(db, user(k.owner), async () => {
      await db.query(
        "update public.clients set email = 'pia@example.test', address = '12 Lake Road', notes = 'Prefers calls', consent_at = now(), consent_source = 'staff' where id = $1",
        [k.client],
      );
      await db.query("update public.pets set breed = 'Indie', medical_notes = 'Allergic to chicken', photo_path = $2 where id = $1", [
        k.pets[0], `${k.org}/pets/${k.pets[0]}/profile.jpg`,
      ]);
      await db.query("update public.bookings set belongings = 'Blue blanket', notes = 'Gate code 4411' where id = $1", [pastStay]);
      await db.query("insert into public.vaccinations (org_id, pet_id, vaccine, certificate_path) values ($1, $2, 'rabies', $3)", [
        k.org, k.pets[0], `${k.org}/vaccinations/v1.pdf`,
      ]);
      await db.query("insert into public.stay_updates (org_id, booking_id, pet_id, body, media_paths) values ($1, $2, $3, 'Happy at play', $4)", [
        k.org, pastStay, k.pets[0], [`${k.org}/updates/u1/1.jpg`],
      ]);
      await db.query("insert into public.incidents (org_id, pet_id, booking_id, category, description) values ($1, $2, $3, 'injury', 'Scratched paw near the gate')", [
        k.org, k.pets[0], pastStay,
      ]);
      // A bill, issued, and paid in part.
      const t = computeInvoice([{ description: "Boarding, 3 nights", quantity: 3, unitPriceMinor: 120000, taxRateBp: 0 }], { mode: "none" }, { roundToWholeUnit: true });
      const draft = await db.query<{ id: string }>("insert into public.invoices (org_id, client_id, booking_id) values ($1, $2, $3) returning id", [k.org, k.client, pastStay]);
      await db.query("select public.save_invoice_draft($1, $2, $3)", [
        draft.rows[0].id,
        JSON.stringify({ subtotal_minor: t.subtotalMinor, discount_minor: 0, taxable_minor: t.taxableMinor, cgst_minor: 0, sgst_minor: 0, igst_minor: 0, tax_minor: 0, round_off_minor: t.roundOffMinor, total_minor: t.totalMinor }),
        JSON.stringify(t.lines.map((l, i) => ({
          sort_order: i, description: l.description, sac_code: null, quantity: l.quantity, unit_price_minor: l.unitPriceMinor, discount_minor: 0,
          taxable_minor: l.taxableMinor, tax_rate_bp: 0, cgst_minor: 0, sgst_minor: 0, igst_minor: 0, tax_minor: 0, total_minor: l.totalMinor,
        }))),
      ]);
      issuedNumber = (await db.query<{ number: string }>("select number from public.issue_invoice($1)", [draft.rows[0].id])).rows[0].number;
      await db.query("insert into public.payments (org_id, client_id, invoice_id, amount_minor, method, received_on) values ($1, $2, $3, 100000, 'upi', '2026-01-13')", [
        k.org, k.client, draft.rows[0].id,
      ]);
    });
  });

  it("are exported in full to an owner or manager", async () => {
    const exported = await as(db, user(manager), async () => (await db.query<{ e: Exported }>("select public.export_client($1) as e", [k.client])).rows[0].e);
    expect(exported.format).toBe("wagbook-parent-export-1");
    expect(exported.parent.email).toBe("pia@example.test");
    expect(exported.parent).not.toHaveProperty("org_id");
    expect(exported.pets).toHaveLength(2);
    const pet = exported.pets.find((p) => p.id === k.pets[0])!;
    expect(pet.medical_notes).toBe("Allergic to chicken");
    expect(pet.vaccinations[0].vaccine).toBe("rabies");
    expect(pet.incidents[0].description).toContain("Scratched paw");
    expect(exported.stays[0].belongings).toBe("Blue blanket");
    expect(exported.stays[0]).not.toHaveProperty("public_token");
    expect(exported.stays[0].updates[0].body).toBe("Happy at play");
    expect(exported.bills[0].number).toBe(issuedNumber);
    expect(exported.bills[0]).not.toHaveProperty("public_token");
    expect(exported.payments).toHaveLength(1);
    expect(exported.files).toEqual(expect.arrayContaining([
      `${k.org}/pets/${k.pets[0]}/profile.jpg`, `${k.org}/pets/${k.pets[0]}/profile.small.jpg`, `${k.org}/vaccinations/v1.pdf`,
      `${k.org}/updates/u1/1.jpg`, `${k.org}/updates/u1/1.small.jpg`,
    ]));
  });

  it("are not exported or erased by staff, or by another kennel", async () => {
    for (const fn of ["export_client", "erase_client"]) {
      expect((await errorOf(() => as(db, user(staff), () => db.query(`select public.${fn}($1)`, [k.client])))).message).toContain("WB070");
      // Another kennel cannot even see that the parent exists.
      expect((await errorOf(() => as(db, user(otherKennel.owner), () => db.query(`select public.${fn}($1)`, [k.client])))).message).toContain("WB003");
      expect((await errorOf(() => as(db, anon, () => db.query(`select public.${fn}($1)`, [k.client])))).message).toMatch(/permission denied/);
    }
  });

  it("cannot be marked erased by hand", async () => {
    const e = await errorOf(() => as(db, user(k.owner), () => db.query("update public.clients set erased_at = now() where id = $1", [k.client])));
    expect(e.message).toMatch(/permission denied/);
  });

  it("are not erased while a pet is in house, or a stay is still to come", async () => {
    const now = await book(db, k, { pet: k.pets[1], start: "2026-02-01", end: "2026-02-04", status: "checked_in" });
    expect((await errorOf(() => as(db, user(k.owner), () => db.query("select public.erase_client($1)", [k.client])))).message).toContain("WB071");
    await as(db, admin, () => db.query("update public.bookings set status = 'checked_out', checked_out_at = now() where id = $1", [now]));
    const later = await book(db, k, { pet: k.pets[1], start: "2027-03-01", end: "2027-03-04", status: "requested" });
    expect((await errorOf(() => as(db, user(k.owner), () => db.query("select public.erase_client($1)", [k.client])))).message).toContain("WB072");
    await as(db, user(k.owner), () => db.query("update public.bookings set status = 'cancelled', cancel_reason = 'Plans changed' where id = $1", [later]));
  });

  it("are erased on request, keeping only the bills and the bare stays", async () => {
    const paths = await as(db, user(k.owner), async () => (await db.query<{ p: string[] }>("select public.erase_client($1) as p", [k.client])).rows[0].p);
    expect(paths).toEqual(expect.arrayContaining([`${k.org}/pets/${k.pets[0]}/profile.jpg`, `${k.org}/vaccinations/v1.pdf`, `${k.org}/updates/u1/1.small.jpg`]));

    const c = (await db.query("select * from public.clients where id = $1", [k.client])).rows[0] as Record<string, unknown>;
    expect(c).toMatchObject({ full_name: "Erased", phone: "", email: null, address: null, notes: null, consent_at: null });
    expect(c.erased_at).not.toBeNull();
    expect(c.deleted_at).not.toBeNull();

    const pet = (await db.query("select * from public.pets where id = $1", [k.pets[0]])).rows[0] as Record<string, unknown>;
    expect(pet).toMatchObject({ name: "Erased", breed: null, medical_notes: null, photo_path: null });

    for (const table of ["vaccinations", "stay_updates", "incidents", "care_tasks"]) {
      const n = (await db.query<{ n: string }>(`select count(*) as n from public.${table} where org_id = $1`, [k.org])).rows[0].n;
      expect(Number(n), table).toBe(0);
    }
    const stay = (await db.query("select start_date, end_date, rate_minor, belongings, notes, cancel_reason from public.bookings where id = $1", [pastStay])).rows[0] as Record<string, unknown>;
    expect(stay).toMatchObject({ belongings: null, notes: null, rate_minor: 120000 });

    // The issued bill stays as it was, with the buyer the law needs on it.
    const bill = (await db.query<{ status: string; buyer: { name: string } }>("select status, buyer from public.invoices where number = $1 and org_id = $2", [issuedNumber, k.org])).rows[0];
    expect(bill.status).toBe("issued");
    expect(bill.buyer.name).toMatch(/^Parent /);
    expect(Number((await db.query<{ n: string }>("select count(*) as n from public.payments where client_id = $1", [k.client])).rows[0].n)).toBe(1);

    // No personal text is left in the history of changes, and the erasure is in it.
    const history = JSON.stringify((await db.query("select old_data, new_data from public.audit_log where org_id = $1", [k.org])).rows);
    for (const secret of ["Blue blanket", "Gate code 4411", "Scratched paw", "Plans changed"]) expect(history).not.toContain(secret);
    expect(Number((await db.query<{ n: string }>("select count(*) as n from public.audit_log where table_name = 'clients' and row_id = $1", [k.client])).rows[0].n)).toBe(1);

    expect((await errorOf(() => as(db, user(k.owner), () => db.query("select public.erase_client($1)", [k.client])))).message).toContain("WB073");
  });

  it("stay hidden once erased", async () => {
    const e = await errorOf(() => as(db, user(staff), () => db.query("update public.clients set deleted_at = null where id = $1", [k.client])));
    expect(e.message).toContain("clients_erased_stay_hidden");
  });

  it("leave the phone number free for a new parent", async () => {
    await as(db, user(staff), () => db.query("insert into public.clients (org_id, full_name, phone) values ($1, 'New Parent', '+919812345678')", [k.org]));
  });
});

describe("certificates sent with the intake form", () => {
  let k: Kennel;
  let folder: string;
  let token: string;

  const form = (pets: { name: string; vaccine?: string }[]) => ({
    v: 1,
    parent: { name: "Pia Parent", phone: `+9197${String(Date.now()).slice(-8)}` },
    pets: pets.map((p) => ({ name: p.name, vaccinations: p.vaccine ? [{ vaccine: p.vaccine, given_on: null, valid_until: "2027-01-01" }] : [] })),
    stay: {},
    consent: true,
  });

  async function submit(payload: unknown) {
    const slug = (await db.query<{ slug: string }>("select slug from public.organizations where id = $1", [k.org])).rows[0].slug;
    return as(db, anon, async () => (await db.query<{ r: { folder: string; upload_token: string } }>("select public.submit_intake($1, $2::jsonb) as r", [slug, JSON.stringify(payload)])).rows[0].r);
  }

  /** An anonymous upload, as Storage would make it with this header. */
  async function upload(name: string, header: string | null = token) {
    await db.query("select set_config('request.headers', $1, false)", [header === null ? "" : JSON.stringify({ "x-wagbook-intake": header })]);
    try {
      await as(db, anon, () => db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [name]));
    } finally {
      await db.query("select set_config('request.headers', '', false)");
    }
  }
  const refused = async (name: string, header?: string | null) => (await errorOf(() => upload(name, header))).message;

  beforeAll(async () => {
    k = await seedKennel(db);
    await as(db, user(k.owner), () => db.query("update public.organizations set intake_enabled = true where id = $1", [k.org]));
    ({ folder, upload_token: token } = await submit(form([{ name: "Rex", vaccine: "rabies" }, { name: "Mia" }])));
  });

  it("lets whoever sent the form add one file per pet on it", async () => {
    await upload(`${folder}/pet-1`);
    await upload(`${folder}/pet-2`);
    expect(await refused(`${folder}/pet-1`)).toMatch(/duplicate key|unique/);
  });

  it("refuses everyone else, and every other name", async () => {
    expect(await refused(`${folder}/pet-3`)).toMatch(/row-level security/);
    expect(await refused(`${folder}/pet-1.pdf`)).toMatch(/row-level security/);
    expect(await refused(`${folder}/../pets/x/profile.jpg`)).toMatch(/row-level security/);
    expect(await refused(`${k.org}/pets/${k.pets[0]}/profile.jpg`)).toMatch(/row-level security/);
    expect(await refused(`${folder}/pet-2`, null)).toMatch(/row-level security/);
    expect(await refused(`${folder}/pet-2`, "f".repeat(64))).toMatch(/row-level security/);
    // Another form's token does not open this form's folder.
    const second = await submit(form([{ name: "Bo" }, { name: "Jo" }, { name: "Lo" }]));
    expect(await refused(`${folder}/pet-3`, second.upload_token)).toMatch(/row-level security/);
  });

  it("cannot read back, replace or remove what it sent", async () => {
    await db.query("select set_config('request.headers', $1, false)", [JSON.stringify({ "x-wagbook-intake": token })]);
    try {
      const seen = await as(db, anon, async () => (await db.query("select name from storage.objects")).rows);
      expect(seen).toEqual([]);
      await as(db, anon, () => db.query("delete from storage.objects where name like $1", [`${folder}/%`]));
    } finally {
      await db.query("select set_config('request.headers', '', false)");
    }
    expect(Number((await db.query<{ n: string }>("select count(*) as n from storage.objects where name like $1", [`${folder}/%`])).rows[0].n)).toBe(2);
  });

  it("closes an hour after the form was sent, or once staff have dealt with it", async () => {
    const late = await submit(form([{ name: "Kit" }]));
    await as(db, admin, () => db.query("update public.intake_submissions set created_at = now() - interval '61 minutes' where upload_token = $1", [late.upload_token]));
    expect(await refused(`${late.folder}/pet-1`, late.upload_token)).toMatch(/row-level security/);

    const declined = await submit(form([{ name: "Pip" }]));
    await as(db, user(k.owner), () => db.query("update public.intake_submissions set status = 'rejected' where upload_token = $1", [declined.upload_token]));
    expect(await refused(`${declined.folder}/pet-1`, declined.upload_token)).toMatch(/row-level security/);
  });

  it("puts the certificate on the pet's vaccinations when the form is accepted", async () => {
    const id = folder.split("/").pop();
    await as(db, user(k.owner), () => db.query("select public.accept_intake($1)", [id]));
    const rows = (await db.query<{ certificate_path: string; name: string }>(
      "select v.certificate_path, p.name from public.vaccinations v join public.pets p on p.id = v.pet_id where v.org_id = $1", [k.org],
    )).rows;
    expect(rows).toEqual([{ certificate_path: `${folder}/pet-1`, name: "Rex" }]);
  });

  it("lets the kennel's staff see the files, and nobody else", async () => {
    const staff = await addMember(db, k, "staff");
    const other = await createUser(db, "stranger-mfa@example.test");
    expect(await count(user(staff), "select count(*) as n from storage.objects where name like $1", [`${folder}/%`])).toBe(2);
    expect(await count(user(other), "select count(*) as n from storage.objects where name like $1", [`${folder}/%`])).toBe(0);
  });
});
