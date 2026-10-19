import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { anon, as, createTestDb, errorOf, user } from "./harness";

let db: PGlite;
let k: Kennel;
let staff: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 3, pets: 3 });
  staff = await addMember(db, k, "staff");
});
afterAll(() => db.close());

async function task(booking: string, pet: string, kind: string, label: string): Promise<string> {
  return as(db, user(staff), async () => {
    const r = await db.query<{ id: string }>(
      "insert into public.care_tasks (org_id, booking_id, pet_id, task_date, kind, label) values ($1, $2, $3, '2027-04-15', $4, $5) returning id",
      [k.org, booking, pet, kind, label],
    );
    return r.rows[0].id;
  });
}

describe("the care round", () => {
  it("refuses to skip a medicine without saying why", async () => {
    const b = await book(db, k, { pet: k.pets[0], start: "2027-04-14", end: "2027-04-17", status: "checked_in" });
    const pill = await task(b, k.pets[0], "medication", "Tablet");
    const e = await errorOf(() => as(db, user(staff), () => db.query("update public.care_tasks set status = 'skipped', note = '  ' where id = $1", [pill])));
    expect(e.message).toContain("care_tasks_skipped_medication_needs_note");
    await as(db, user(staff), () => db.query("update public.care_tasks set status = 'skipped', note = 'Vomited, vet called' where id = $1", [pill]));

    // Other tasks can be skipped without a note.
    const walk = await task(b, k.pets[0], "walk", "Evening walk");
    await as(db, user(staff), () => db.query("update public.care_tasks set status = 'skipped' where id = $1", [walk]));
  });

  it("survives a double tap: marking done twice keeps the first who and when", async () => {
    const b = await book(db, k, { pet: k.pets[1], start: "2027-04-14", end: "2027-04-17", status: "checked_in" });
    const meal = await task(b, k.pets[1], "meal", "Breakfast");
    await as(db, user(staff), () => db.query("update public.care_tasks set status = 'done' where id = $1", [meal]));
    const first = await db.query<{ done_at: string; done_by: string }>("select done_at::text, done_by from public.care_tasks where id = $1", [meal]);

    const other = await addMember(db, k, "staff");
    await as(db, user(other), () => db.query("update public.care_tasks set status = 'done', done_at = '2000-01-01' where id = $1", [meal]));
    const second = await db.query<{ done_at: string; done_by: string }>("select done_at::text, done_by from public.care_tasks where id = $1", [meal]);
    expect(second.rows[0]).toEqual(first.rows[0]);
    expect(second.rows[0].done_by).toBe(staff);
  });

  it("shows the parent exactly the care that was ticked", async () => {
    const b = await book(db, k, { pet: k.pets[2], start: "2027-04-14", end: "2027-04-17", status: "checked_in" });
    const meals = [await task(b, k.pets[2], "meal", "Breakfast"), await task(b, k.pets[2], "meal", "Lunch"), await task(b, k.pets[2], "meal", "Dinner")];
    await as(db, user(staff), async () => {
      await db.query("update public.care_tasks set status = 'done' where id = any($1::uuid[])", [[meals[0], meals[1]]]);
      await db.query("update public.care_tasks set status = 'skipped', note = 'Not hungry' where id = $1", [meals[2]]);
    });
    const token = (await db.query<{ public_token: string }>("select public_token from public.bookings where id = $1", [b])).rows[0].public_token;
    const stay = await as(db, anon, async () => (await db.query<{ s: { care: { kind: string; done: number; total: number }[] } }>("select public.get_public_stay($1) as s", [token])).rows[0].s);
    // Two done; the skipped one is not counted as owed.
    expect(stay.care).toEqual([{ date: "2027-04-15", kind: "meal", done: 2, total: 2 }]);
  });
});

describe("play hours", () => {
  it("must be in order, with any break inside them", async () => {
    const set = (values: string) => as(db, user(k.owner), () => db.query(`update public.organizations set ${values} where id = $1`, [k.org]));
    expect((await errorOf(() => set("play_day_start = '18:00', play_day_end = '08:00'"))).message).toContain("organizations_play_hours_in_order");
    expect((await errorOf(() => set("play_break_start = '12:00'"))).message).toContain("organizations_play_break_inside_day");
    expect((await errorOf(() => set("play_break_start = '07:00', play_break_end = '09:00'"))).message).toContain("organizations_play_break_inside_day");
    await set("play_day_start = '07:00', play_day_end = '19:00', play_break_start = '11:00', play_break_end = '16:00', play_changeover_minutes = 5");
  });

  it("are settings only owners and managers change", async () => {
    await as(db, user(staff), () => db.query("update public.organizations set play_day_start = '06:00' where id = $1", [k.org]));
    const row = await db.query<{ start: string }>("select play_day_start::text as start from public.organizations where id = $1", [k.org]);
    expect(row.rows[0].start).toBe("07:00:00");
  });

  it("lets staff move a session, and refuses a move onto another pet's slot", async () => {
    const other = await strangerPet(db, k);
    const b1 = await book(db, k, { pet: k.pets[0], start: "2027-05-14", end: "2027-05-17", status: "checked_in" });
    const b2 = await book(db, k, { pet: other, start: "2027-05-14", end: "2027-05-17", status: "checked_in" });
    const yard = await as(db, user(k.owner), async () => (await db.query<{ id: string }>("insert into public.play_yards (org_id, name) values ($1, 'Yard A') returning id", [k.org])).rows[0].id);
    const add = (booking: string, pet: string, at: string) =>
      as(db, user(staff), async () =>
        (await db.query<{ id: string }>(
          "insert into public.play_sessions (org_id, yard_id, booking_id, pet_id, session_date, starts_at, duration_minutes) values ($1, $2, $3, $4, '2027-05-15', $5, 20) returning id",
          [k.org, yard, booking, pet, at],
        )).rows[0].id,
      );
    await add(b1, k.pets[0], "08:00");
    const s2 = await add(b2, other, "08:20");
    expect((await errorOf(() => as(db, user(staff), () => db.query("update public.play_sessions set starts_at = '08:10' where id = $1", [s2])))).message).toContain(
      "play_sessions_one_pet_per_yard",
    );
    await as(db, user(staff), () => db.query("update public.play_sessions set starts_at = '09:00' where id = $1", [s2]));
  });
});
