import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookAppointment, day, q, seedAppointments, type Appointments } from "./appointment-fixtures";
import { addMember, strangerPet } from "./fixtures";
import { createTestDb, errorOf } from "./harness";
import { seedKitchen } from "./kitchen-fixtures";

/**
 * Roadmap M35 and M36: grooming cards and reminders, swims with a life jacket
 * and a supervisor, training courses sold as packs, birthday parties with one
 * guest dog and a cap on people, and made-to-order items with a lead time.
 */

let db: PGlite;
let k: Appointments;
let staff: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedAppointments(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
});
afterAll(() => db.close());

describe("grooming (M35)", () => {
  it("keeps a grooming card any member writes, and remembers a groom reminder sent", async () => {
    await q(db, staff, "insert into public.pet_grooming (org_id, pet_id, usual_cut, every_weeks) values ($1, $2, 'Short summer cut', 6)", [k.org, k.pets[0]]);
    await q(db, staff, "update public.pets set coat = 'curly' where id = $1", [k.pets[0]]);
    const [card] = await q<{ usual_cut: string; updated_by: string }>(db, staff, "select usual_cut, updated_by from public.pet_grooming where pet_id = $1", [k.pets[0]]);
    expect(card).toEqual({ usual_cut: "Short summer cut", updated_by: staff });
    const groom = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.groom, day: await day(db, k, 1), time: "09:00", minutes: 120 });
    await q(db, staff, "insert into public.reminders_sent (org_id, kind, subject_id, sent_on) values ($1, 'groom', $2, current_date)", [k.org, groom]);
  });
});

describe("swimming (M36)", () => {
  it("is done only with its supervisor and whether the dog wore a life jacket", async () => {
    const id = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.swim, day: await day(db, k, 2), time: "10:00" });
    await q(db, staff, "update public.appointments set vaccinations_checked_at = now() where id = $1", [id]);
    const none = await errorOf(() => q(db, staff, "update public.appointments set status = 'done' where id = $1", [id]));
    expect(none.message).toContain("WB195");
    const noSupervisor = await errorOf(() => q(db, staff, "update public.appointments set status = 'done', life_jacket = true where id = $1", [id]));
    expect(noSupervisor.message).toContain("WB195");
    await q(db, staff, "update public.appointments set status = 'done', life_jacket = true, staff_id = $2 where id = $1", [id, staff]);
  });
});

describe("training courses (M36)", () => {
  let course: string;

  it("are sold by owners and managers only", async () => {
    const sell = (actor: string) =>
      q<{ id: string }>(db, actor, "insert into public.courses (org_id, client_id, pet_id, service_id, name, sessions, price_minor, starts_on) values ($1, $2, $3, $4, 'Puppy basics', 2, 600000, current_date) returning id", [k.org, k.client, k.pets[2], k.training]);
    const e = await errorOf(() => sell(staff));
    expect(e.message).toContain("row-level security");
    [{ id: course }] = await sell(manager);
  });

  it("pays for its sessions, never more than were bought, for its own pet", async () => {
    const d = await day(db, k, 3);
    const a = await bookAppointment(db, staff, k, { pet: k.pets[2], service: k.training, day: d, time: "09:00", course });
    await bookAppointment(db, staff, k, { pet: k.pets[2], service: k.training, day: d, time: "11:00", course });
    const [row] = await q<{ price_minor: string }>(db, staff, "select price_minor from public.appointments where id = $1", [a]);
    expect(Number(row.price_minor)).toBe(0);
    const third = await errorOf(() => bookAppointment(db, staff, k, { pet: k.pets[2], service: k.training, day: d, time: "14:00", course }));
    expect(third.message).toContain("WB201: the course has 0 sessions left");
    const other = await errorOf(() => bookAppointment(db, staff, k, { pet: k.pets[1], service: k.training, day: d, time: "14:00", course }));
    expect(other.message).toContain("WB202");
    const [balance] = await q<{ sessions_used: number; sessions_left: number }>(db, staff, "select sessions_used, sessions_left from public.course_balances where course_id = $1", [course]);
    expect(balance).toEqual({ sessions_used: 2, sessions_left: 0 });
    // A cancelled session gives its place back.
    await q(db, staff, "update public.appointments set status = 'cancelled', cancel_reason = 'Rain' where id = $1", [a]);
    await bookAppointment(db, staff, k, { pet: k.pets[2], service: k.training, day: d, time: "14:00", course });
  });

  it("keeps the session's notes and homework for the parent", async () => {
    const [{ id }] = await q<{ id: string }>(db, staff, "select id from public.appointments where course_id = $1 and status = 'confirmed' order by starts_at limit 1", [course]);
    await q(db, staff, "update public.appointments set status = 'done', after_notes = 'Sits on cue', homework = 'Five minutes of sit a day' where id = $1", [id]);
  });
});

describe("birthday parties (M36)", () => {
  it("take one guest dog, never the birthday pet itself, and no more people than allowed", async () => {
    const d = await day(db, k, 4);
    const guest = await strangerPet(db, k);
    const id = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.party, day: d, time: "10:00", minutes: 180 });
    const self = await errorOf(() => q(db, staff, "update public.appointments set guest_pet_id = pet_id where id = $1", [id]));
    expect(self.message).toContain("appointments_guest_is_another_pet");
    const crowd = await errorOf(() => q(db, staff, "update public.appointments set people = 6 where id = $1", [id]));
    expect(crowd.message).toContain("WB197: a party takes 5 people at most");
    await q(db, staff, "update public.appointments set people = 5, guest_pet_id = $2, vaccinations_checked_at = now() where id = $1", [id, guest]);
    // The guest meets the same rule as a boarder.
    const unchecked = await errorOf(() => q(db, staff, "update public.appointments set status = 'done' where id = $1", [id]));
    expect(unchecked.message).toContain("WB196");
    await q(db, staff, "update public.appointments set status = 'done', guest_vaccinations_checked_at = now() where id = $1", [id]);
  });
});

describe("made-to-order items (M36)", () => {
  it("need the kennel's lead time, and carry the words to write on them", async () => {
    const kitchen = await seedKitchen(db);
    const order = (date: string) =>
      q(db, kitchen.owner, "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, slot, inscription) values ($1, 'item', $2, $3, $4, $5, 'morning', 'Happy birthday Bruno')", [kitchen.org, kitchen.client, kitchen.pets[0], kitchen.cake, date]);
    const tooSoon = await errorOf(async () => order(await day(db, kitchen, 0)));
    expect(tooSoon.message).toContain("WB156: a made-to-order item needs 24 hours' notice");
    await order(await day(db, kitchen, 3));
  });
});

describe("a parent's details (M9)", () => {
  it("export their appointments, and are not erased while one is still to come; then its notes go", async () => {
    const [{ e }] = await q<{ e: { appointments: { id: string }[]; courses: { name: string }[] } }>(db, manager, "select public.export_client($1) as e", [k.client]);
    expect(e.appointments.length).toBeGreaterThan(0);
    expect(e.courses.map((c) => c.name)).toEqual(["Puppy basics"]);
    const refused = await errorOf(() => q(db, k.owner, "select public.erase_client($1)", [k.client]));
    expect(refused.message).toContain("WB076");
    await q(db, k.owner, "update public.appointments set status = 'cancelled', cancel_reason = 'Moving away' where client_id = $1 and status in ('requested', 'confirmed')", [k.client]);
    await q(db, k.owner, "update public.courses set notes = 'Nervous of men in hats' where client_id = $1", [k.client]);
    await q(db, k.owner, "select public.erase_client($1)", [k.client]);
    const left = await q<{ n: number }>(db, k.owner, "select count(*)::int as n from public.appointments where client_id = $1 and (homework is not null or after_notes is not null or cancel_reason <> 'Erased')", [k.client]);
    expect(left[0].n).toBe(0);
    // Nor is any of it left in the history of changes.
    const [{ history }] = await q<{ history: string }>(db, k.owner, "select coalesce(jsonb_agg(jsonb_build_array(old_data, new_data)), '[]')::text as history from public.audit_log where org_id = $1", [k.org]);
    for (const secret of ["Sits on cue", "Five minutes of sit a day", "Moving away", "Nervous of men in hats"]) expect(history, secret).not.toContain(secret);
  });
});

