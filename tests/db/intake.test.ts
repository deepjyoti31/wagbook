import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { anon, as, createTestDb, errorOf, user } from "./harness";

let db: PGlite;
let k: Kennel;
let slug: string;

const form = (over: Record<string, unknown> = {}) => ({
  v: 1,
  parent: { name: "Asha Rao", phone: "+919811122233", email: "asha@example.test", city: "Bengaluru", emergency_name: "Ravi", emergency_phone: "+919800000000" },
  pets: [
    {
      name: "Bruno", species: "dog", breed: "Labrador", sex: "male", is_neutered: true, date_of_birth: "2023-05-01",
      weight_kg: "34.5", food_notes: "200 g kibble twice a day", allergies: "chicken",
      vaccinations: [{ vaccine: "rabies", given_on: "2026-11-01", valid_until: "2027-11-01" }, { vaccine: "", given_on: "nonsense" }],
    },
    { name: "Coco", species: "dragon", sex: "robot", weight_kg: "heavy" },
  ],
  stay: { kind: "boarding", start_date: "2027-04-14", end_date: "2027-04-17", notes: "First stay" },
  consent: true,
  ...over,
});

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db);
  slug = (await db.query<{ slug: string }>("select slug from public.organizations where id = $1", [k.org])).rows[0].slug;
});
afterAll(() => db.close());

const submit = (payload: unknown, s = slug) =>
  as(db, anon, () => db.query<{ ok: { folder: string; upload_token: string } }>("select public.submit_intake($1, $2::jsonb) as ok", [s, JSON.stringify(payload)]));

describe("the public intake form", () => {
  it("tells an anonymous visitor only what the form page needs", async () => {
    await as(db, anon, async () => {
      const res = await db.query<{ v: Record<string, unknown> }>("select public.get_public_intake_form($1) as v", [slug.toUpperCase()]);
      expect(Object.keys(res.rows[0].v).sort()).toEqual(
        ["check_in_time", "check_out_time", "city", "intake_enabled", "language", "name", "notice", "whatsapp_phone"],
      );
      expect(String(res.rows[0].v.notice)).toContain("Test Kennel");
      expect((await db.query<{ v: unknown }>("select public.get_public_intake_form('no-such-kennel') as v")).rows[0].v).toBeNull();
    });
  });

  it("stores a submission with the consent wording, without creating any client", async () => {
    const sent = (await submit(form())).rows[0].ok;
    expect(sent.folder).toMatch(new RegExp(`^${k.org}/intake/[0-9a-f-]{36}$`));
    expect(sent.upload_token).toMatch(/^[0-9a-f]{64}$/);
    const sub = await db.query<{ status: string; parent_phone: string; consent_text: string; requested_start: string }>(
      "select status, parent_phone, consent_text, requested_start::text from public.intake_submissions where org_id = $1",
      [k.org],
    );
    expect(sub.rows).toHaveLength(1);
    expect(sub.rows[0]).toMatchObject({ status: "new", parent_phone: "+919811122233", requested_start: "2027-04-14" });
    expect(sub.rows[0].consent_text).toContain("I agree");
    const clients = await db.query("select 1 from public.clients where org_id = $1 and phone = '+919811122233'", [k.org]);
    expect(clients.rows).toHaveLength(0);
  });

  it("rejects bad submissions with a clear reason", async () => {
    const cases: [unknown, string][] = [
      [form({ consent: false }), "WB042"],
      [form({ parent: { name: "A", phone: "+919811122233" } }), "WB043"],
      [form({ parent: { name: "Asha", phone: "9811122233" } }), "WB044"],
      [form({ pets: [] }), "WB045"],
      [form({ pets: Array.from({ length: 7 }, (_, i) => ({ name: `P${i}` })) }), "WB045"],
      [form({ pets: [{ name: " " }] }), "WB046"],
      [form({ stay: { start_date: "2027-04-17", end_date: "2027-04-14" } }), "WB047"],
      [form({ stay: { start_date: "soon" } }), "WB047"],
      [form({ padding: "x".repeat(21000) }), "WB041"],
      [[1, 2, 3], "WB041"],
    ];
    for (const [payload, code] of cases) {
      const e = await errorOf(() => submit(payload));
      expect(e.message, JSON.stringify(payload).slice(0, 80)).toContain(code);
    }
    expect((await errorOf(() => submit(form(), "no-such-kennel"))).message).toContain("WB040");
  });

  it("can be switched off by the kennel", async () => {
    await as(db, user(k.owner), () => db.query("update public.organizations set intake_enabled = false where id = $1", [k.org]));
    expect((await errorOf(() => submit(form()))).message).toContain("WB040");
    await as(db, user(k.owner), () => db.query("update public.organizations set intake_enabled = true where id = $1", [k.org]));
  });

  it("stops one phone number from flooding the kennel", async () => {
    const f = form({ parent: { name: "Spammer", phone: "+919822233344" } });
    for (let i = 0; i < 5; i++) await submit(f);
    expect((await errorOf(() => submit(f))).message).toContain("WB048");
  });

  it("gives the anonymous role no way to read submissions back", async () => {
    expect((await errorOf(() => as(db, anon, () => db.query("select * from public.intake_submissions")))).code).toBe("42501");
    expect((await errorOf(() => as(db, anon, () => db.query("select public.accept_intake(gen_random_uuid())")))).code).toBe("42501");
  });
});

describe("accepting a submission", () => {
  it("creates the client, pets and vaccinations, tolerating junk fields", async () => {
    const staff = await addMember(db, k, "staff");
    const subId = (await db.query<{ id: string }>(
      "select id from public.intake_submissions where org_id = $1 and parent_phone = '+919811122233'", [k.org],
    )).rows[0].id;

    const clientId = await as(db, user(staff), async () =>
      (await db.query<{ id: string }>("select public.accept_intake($1) as id", [subId])).rows[0].id,
    );

    const client = await db.query<{ full_name: string; email: string; consent_source: string; emergency_name: string }>(
      "select full_name, email, consent_source, emergency_name from public.clients where id = $1", [clientId],
    );
    expect(client.rows[0]).toMatchObject({ full_name: "Asha Rao", email: "asha@example.test", consent_source: "intake_form", emergency_name: "Ravi" });

    const pets = await db.query<{ name: string; species: string; sex: string; weight_kg: string | null; is_neutered: boolean | null; allergies: string | null }>(
      "select name, species, sex, weight_kg, is_neutered, allergies from public.pets where client_id = $1 order by name", [clientId],
    );
    expect(pets.rows).toEqual([
      { name: "Bruno", species: "dog", sex: "male", weight_kg: "34.50", is_neutered: true, allergies: "chicken" },
      { name: "Coco", species: "dog", sex: "unknown", weight_kg: null, is_neutered: null, allergies: null },
    ]);

    const vax = await db.query<{ vaccine: string; valid_until: string }>(
      "select v.vaccine, v.valid_until::text from public.vaccinations v join public.pets p on p.id = v.pet_id where p.client_id = $1", [clientId],
    );
    expect(vax.rows).toEqual([{ vaccine: "rabies", valid_until: "2027-11-01" }]);

    const sub = await db.query<{ status: string; client_id: string; reviewed_by: string }>(
      "select status, client_id, reviewed_by from public.intake_submissions where id = $1", [subId],
    );
    expect(sub.rows[0]).toMatchObject({ status: "accepted", client_id: clientId, reviewed_by: staff });

    // Accepting twice changes nothing.
    const again = await as(db, user(staff), async () =>
      (await db.query<{ id: string }>("select public.accept_intake($1) as id", [subId])).rows[0].id,
    );
    expect(again).toBe(clientId);
    expect((await db.query("select 1 from public.pets where client_id = $1", [clientId])).rows).toHaveLength(2);
  });

  it("recognises a returning parent by phone and adds only the new pet", async () => {
    await submit(form({ pets: [{ name: "bruno" }, { name: "Mango", species: "cat" }] }));
    const subId = (await db.query<{ id: string }>(
      "select id from public.intake_submissions where org_id = $1 and parent_phone = '+919811122233' and status = 'new'", [k.org],
    )).rows[0].id;
    const clientId = await as(db, user(k.owner), async () =>
      (await db.query<{ id: string }>("select public.accept_intake($1) as id", [subId])).rows[0].id,
    );
    const clients = await db.query("select 1 from public.clients where org_id = $1 and phone = '+919811122233'", [k.org]);
    expect(clients.rows).toHaveLength(1);
    const pets = await db.query<{ name: string }>("select name from public.pets where client_id = $1 order by name", [clientId]);
    expect(pets.rows.map((p) => p.name)).toEqual(["Bruno", "Coco", "Mango"]);
  });

  it("cannot be used on another organisation's submission", async () => {
    const other = await seedKennel(db);
    await submit(form({ parent: { name: "Someone Else", phone: "+919833344455" } }));
    const subId = (await db.query<{ id: string }>(
      "select id from public.intake_submissions where parent_phone = '+919833344455'",
    )).rows[0].id;
    const e = await errorOf(() => as(db, user(other.owner), () => db.query("select public.accept_intake($1)", [subId])));
    expect(e.message).toContain("WB003");
  });
});

describe("the parent's stay page", () => {
  it("shows the stay to anyone holding the token, without private details", async () => {
    const id = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", kennel: k.kennels[0], status: "checked_in" });
    const token = (await db.query<{ public_token: string }>("select public_token from public.bookings where id = $1", [id])).rows[0].public_token;

    await as(db, user(k.owner), async () => {
      await db.query("update public.pets set medical_notes = 'SECRET-MEDICAL' where id = $1", [k.pets[0]]);
      await db.query("update public.bookings set notes = 'SECRET-NOTE' where id = $1", [id]);
      await db.query("insert into public.stay_updates (org_id, booking_id, pet_id, body) values ($1, $2, $3, 'Had a great walk')", [k.org, id, k.pets[0]]);
      await db.query(
        "insert into public.stay_updates (org_id, booking_id, pet_id, body, is_visible_to_parent) values ($1, $2, $3, 'SECRET-HANDOVER', false)",
        [k.org, id, k.pets[0]],
      );
      await db.query(
        "insert into public.care_tasks (org_id, booking_id, pet_id, task_date, kind, label, status) values ($1, $2, $3, '2027-04-15', 'meal', 'Breakfast', 'done'), ($1, $2, $3, '2027-04-15', 'meal', 'Dinner', 'pending')",
        [k.org, id, k.pets[0]],
      );
    });

    await as(db, anon, async () => {
      const res = await db.query<{ v: { pet: { name: string }; booking: { status: string; start_date: string }; updates: { body: string }[]; care: { kind: string; done: number; total: number }[] } }>(
        "select public.get_public_stay($1) as v", [token],
      );
      const v = res.rows[0].v;
      expect(v.pet.name).toContain("Dog");
      expect(v.booking).toMatchObject({ status: "checked_in", start_date: "2027-04-14" });
      expect(v.updates.map((u) => u.body)).toEqual(["Had a great walk"]);
      expect(v.care).toEqual([{ date: "2027-04-15", kind: "meal", done: 1, total: 2 }]);
      const text = JSON.stringify(v);
      for (const secret of ["SECRET-MEDICAL", "SECRET-NOTE", "SECRET-HANDOVER", "rate_minor", token, k.org]) {
        expect(text).not.toContain(secret);
      }
      for (const bad of ["", token.slice(1), "f".repeat(64)]) {
        expect((await db.query<{ v: unknown }>("select public.get_public_stay($1) as v", [bad])).rows[0].v).toBeNull();
      }
    });

    // A cancelled booking's link stops working.
    await as(db, user(k.owner), () => db.query("update public.bookings set status = 'cancelled' where id = $1", [id]));
    await as(db, anon, async () => {
      expect((await db.query<{ v: unknown }>("select public.get_public_stay($1) as v", [token])).rows[0].v).toBeNull();
    });
  });
});
