import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { at, bookAppointment, day, q, seedAppointments, type Appointments } from "./appointment-fixtures";
import { addMember, book, strangerPet } from "./fixtures";
import { createTestDb, errorOf } from "./harness";

/**
 * Roadmap M58: moving an appointment. The new time is checked as a new
 * appointment's is (the place with its clean-up, the pet and the person one at
 * a time, the place's hours, the stay's days); only one still to come moves,
 * and only to a time still to come; it keeps its add-ons; History of changes
 * keeps the old time.
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

const move = (actor: string, id: string, d: string, time: string, minutes = 60, extra = "") =>
  q(db, actor, `update public.appointments set starts_at = $2, ends_at = $3${extra} where id = $1`, [
    id, at(d, time), new Date(new Date(at(d, time)).getTime() + minutes * 60_000).toISOString(),
  ]);

describe("moving an appointment", () => {
  it("refuses a taken time and moves to a free one, keeping its add-ons", async () => {
    const d = await day(db, k, 2);
    const other = await strangerPet(db, k);
    await bookAppointment(db, staff, k, { pet: other, service: k.swim, day: d, time: "12:00" });
    const id = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.swim, day: d, time: "09:00" });
    await q(db, staff, "insert into public.appointment_items (org_id, appointment_id, service_id, description, unit_price_minor) values ($1, $2, $3, '', 0)", [k.org, id, k.nails]);

    // 11:30 runs into the other swim at 12:00; 12:30 is during it; 13:00 is its clean-up.
    for (const time of ["11:30", "12:30", "13:00"]) {
      expect((await errorOf(() => move(staff, id, d, time))).message).toContain("appointments_no_place_overlap");
    }
    await move(staff, id, d, "13:30");
    const [row] = await q<{ starts_at: string; held_until: string; items: number }>(
      db, staff,
      "select starts_at::text, held_until::text, (select count(*)::int from public.appointment_items i where i.appointment_id = a.id) as items from public.appointments a where id = $1",
      [id],
    );
    expect(new Date(row.starts_at).toISOString()).toBe(at(d, "13:30"));
    expect(new Date(row.held_until).toISOString()).toBe(at(d, "15:00"));
    expect(row.items).toBe(1);
  });

  it("checks the person and the pet at the new time, and the new place's hours", async () => {
    const d = await day(db, k, 3);
    const busy = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.groom, day: d, time: "14:00", minutes: 120, staff });
    const id = await bookAppointment(db, staff, k, { pet: k.pets[2], service: k.swim, day: d, time: "09:00", staff });
    expect((await errorOf(() => move(staff, id, d, "14:30"))).message).toContain("appointments_no_person_overlap");
    // Without the person, the time is free.
    await move(staff, id, d, "14:30", 60, ", staff_id = null");
    // The groom's pet cannot swim during its groom.
    const swim = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.swim, day: d, time: "10:00" });
    expect((await errorOf(() => move(staff, swim, d, "15:00", 60, `, place_id = '${k.yard}'`))).message).toContain("appointments_no_pet_overlap");
    // To the yard, which keeps its own hours.
    expect((await errorOf(() => move(staff, swim, d, "17:30", 60, `, place_id = '${k.yard}'`))).message).toContain("WB192");
    await move(staff, swim, d, "16:00", 60, `, place_id = '${k.yard}'`);
    expect(busy).toBeTruthy();
  });

  it("keeps a boarder's appointment on a day of its stay", async () => {
    const start = await day(db, k, 5);
    const end = await day(db, k, 7);
    const stay = await book(db, k, { pet: k.pets[0], start, end });
    const id = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.swim, day: start, time: "10:00", booking: stay });
    const after = await day(db, k, 8);
    expect((await errorOf(() => move(staff, id, after, "10:00"))).message).toContain("WB193");
    await move(staff, id, end, "10:00");
  });

  it("moves only an appointment still to come, and only to a time still to come", async () => {
    const d = await day(db, k, 4);
    const id = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.groom, day: d, time: "09:00", minutes: 120 });
    const yesterday = await day(db, k, -1);
    expect((await errorOf(() => move(staff, id, yesterday, "10:00", 120))).message).toContain("WB271");
    await q(db, staff, "update public.appointments set status = 'done', vaccinations_checked_at = now() where id = $1", [id]);
    expect((await errorOf(() => move(staff, id, d, "13:00", 120))).message).toContain("WB270");
    const place = await errorOf(() => q(db, staff, "update public.appointments set place_id = $2 where id = $1", [id, k.yard]));
    expect(place.message).toContain("WB270");
    // The notes of a done appointment still change.
    await q(db, staff, "update public.appointments set after_notes = 'Calm on the table' where id = $1", [id]);

    const cancelled = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.groom, day: d, time: "12:00", minutes: 120 });
    await q(db, staff, "update public.appointments set status = 'cancelled', cancel_reason = 'Parent asked' where id = $1", [cancelled]);
    expect((await errorOf(() => move(staff, cancelled, d, "14:00", 120))).message).toContain("WB270");
  });

  it("lets a request move freely among other requests", async () => {
    const d = await day(db, k, 6);
    const other = await strangerPet(db, k);
    await bookAppointment(db, staff, k, { pet: other, service: k.swim, day: d, time: "10:00", status: "requested" });
    const id = await bookAppointment(db, staff, k, { pet: k.pets[2], service: k.swim, day: d, time: "15:00", status: "requested" });
    await move(staff, id, d, "10:00");
  });

  it("keeps the old time in History of changes", async () => {
    const d = await day(db, k, 9);
    const id = await bookAppointment(db, staff, k, { pet: k.pets[2], service: k.swim, day: d, time: "09:00" });
    await move(staff, id, d, "11:00");
    const [log] = await q<{ old_data: Record<string, string>; new_data: Record<string, string> }>(
      db, manager,
      "select old_data, new_data from public.audit_log where table_name = 'appointments' and row_id = $1 and action = 'update' order by id desc limit 1",
      [id],
    );
    expect(new Date(log.old_data.starts_at).toISOString()).toBe(at(d, "09:00"));
    expect(new Date(log.new_data.starts_at).toISOString()).toBe(at(d, "11:00"));
  });
});
