import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookingLines } from "../../src/lib/billing";
import { appointmentPrice } from "../../src/lib/core";
import { appointmentBillLines, at, bookAppointment, day, issueBill, q, seedAppointments, totals, type Appointments } from "./appointment-fixtures";
import { addMember, book, seedKennel, strangerPet } from "./fixtures";
import { createTestDb, errorOf } from "./harness";

/**
 * Roadmap M34: services by appointment. A place takes one appointment at a
 * time with its clean-up; a pet and a person are in one place at a time;
 * times are inside the place's hours; the price is copied and only owners and
 * managers change it; a boarder's appointment is on its stay's bill and a
 * visitor's has its own.
 */

let db: PGlite;
let k: Appointments;
let staff: string;
let manager: string;
let tomorrow: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedAppointments(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  tomorrow = await day(db, k, 1);
});
afterAll(() => db.close());

const fails = (actor: string, fn: () => Promise<unknown>) => errorOf(fn);

describe("one place, one pet, one person at a time", () => {
  it("refuses two swims at overlapping times, and one during the first one's clean-up", async () => {
    const d = await day(db, k, 2);
    const other = await strangerPet(db, k);
    await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.swim, day: d, time: "10:00" });
    const overlap = await fails(staff, () => bookAppointment(db, staff, k, { pet: other, service: k.swim, day: d, time: "10:30" }));
    expect(overlap.message).toContain("appointments_no_place_overlap");
    // The swim ends at 11:00 and the pool is cleaned until 11:30.
    const cleaning = await fails(staff, () => bookAppointment(db, staff, k, { pet: other, service: k.swim, day: d, time: "11:00" }));
    expect(cleaning.message).toContain("appointments_no_place_overlap");
    await bookAppointment(db, staff, k, { pet: other, service: k.swim, day: d, time: "11:30" });
  });

  it("refuses one pet in two places, and one person in two places", async () => {
    const d = await day(db, k, 3);
    await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.swim, day: d, time: "10:00", staff });
    const pet = await fails(staff, () => bookAppointment(db, staff, k, { pet: k.pets[1], service: k.groom, day: d, time: "10:30", minutes: 120 }));
    expect(pet.message).toContain("appointments_no_pet_overlap");
    const person = await fails(staff, () => bookAppointment(db, staff, k, { pet: k.pets[2], service: k.groom, day: d, time: "10:30", minutes: 120, staff }));
    expect(person.message).toContain("appointments_no_person_overlap");
    await bookAppointment(db, staff, k, { pet: k.pets[2], service: k.groom, day: d, time: "10:30", minutes: 120, staff: manager });
  });

  it("lets requests overlap, holding nothing until one is confirmed", async () => {
    const d = await day(db, k, 4);
    const other = await strangerPet(db, k);
    const a = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.swim, day: d, time: "15:00", status: "requested" });
    const b = await bookAppointment(db, staff, k, { pet: other, service: k.swim, day: d, time: "15:00", status: "requested" });
    await q(db, staff, "update public.appointments set status = 'confirmed' where id = $1", [a]);
    const second = await fails(staff, () => q(db, staff, "update public.appointments set status = 'confirmed' where id = $1", [b]));
    expect(second.message).toContain("appointments_no_place_overlap");
  });
});

describe("where and when", () => {
  it("keeps an appointment inside its place's hours, on one day", async () => {
    const early = await fails(staff, () => bookAppointment(db, staff, k, { pet: k.pets[0], service: k.swim, day: tomorrow, time: "08:30" }));
    expect(early.message).toContain("WB192");
    const late = await fails(staff, () => bookAppointment(db, staff, k, { pet: k.pets[0], service: k.swim, day: tomorrow, time: "17:30" }));
    expect(late.message).toContain("Pool is open from 09:00 to 18:00");
  });

  it("refuses a place out of service, and an add-on booked on its own", async () => {
    await q(db, k.owner, "update public.appointment_places set is_active = false where id = $1", [k.table]);
    const closed = await fails(staff, () => bookAppointment(db, staff, k, { pet: k.pets[0], service: k.groom, day: tomorrow, time: "09:00", minutes: 120 }));
    expect(closed.message).toContain("WB191");
    await q(db, k.owner, "update public.appointment_places set is_active = true where id = $1", [k.table]);
    const addon = await fails(staff, () => bookAppointment(db, staff, k, { pet: k.pets[0], service: k.nails, day: tomorrow, time: "09:00", place: k.table }));
    expect(addon.message).toContain("WB190");
  });

  it("copies the service's kind and clean-up, and holds the place until the clean-up ends", async () => {
    const id = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.swim, day: tomorrow, time: "13:00" });
    const [row] = await q<{ kind: string; held_until: string; place_id: string }>(db, staff, "select kind, held_until::text, place_id from public.appointments where id = $1", [id]);
    expect(row.kind).toBe("swim");
    expect(row.place_id).toBe(k.pool);
    expect(new Date(row.held_until).toISOString()).toBe(at(tomorrow, "14:30"));
  });
});

describe("the price", () => {
  it("is copied from the service for the pet, whatever staff send, and matches the app's sum", async () => {
    const d = await day(db, k, 5);
    await q(db, k.owner, "update public.pets set coat = 'double', breed = 'Labrador' where id = $1", [k.pets[0]]);
    const id = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.groom, day: d, time: "09:00", minutes: 120, price: 1 });
    const [row] = await q<{ price_minor: string }>(db, staff, "select price_minor from public.appointments where id = $1", [id]);
    expect(Number(row.price_minor)).toBe(120000);
    const prices = await q<{ size: null; coat: "double" | null; breed: string | null; price_minor: string }>(db, staff, "select size, coat, breed, price_minor from public.appointment_service_prices where service_id = $1", [k.groom]);
    const ts = appointmentPrice({ pricing: "by_coat", price_minor: 100000 }, { weight_g: null, coat: "double", breed: "Labrador" }, prices.map((p) => ({ ...p, price_minor: Number(p.price_minor) })), { small_dog_max_g: 10000, medium_dog_max_g: 25000 });
    expect(ts).toBe(120000);
    // A named breed overrides the coat.
    await q(db, k.owner, "update public.pets set breed = 'golden retriever' where id = $1", [k.pets[0]]);
    const [{ p }] = await q<{ p: string }>(db, staff, "select public.appointment_price($1, $2, $3) as p", [k.org, k.groom, k.pets[0]]);
    expect(Number(p)).toBe(150000);
  });

  it("is changed only by an owner or manager", async () => {
    const d = await day(db, k, 5);
    const id = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.swim, day: d, time: "15:00" });
    const e = await fails(staff, () => q(db, staff, "update public.appointments set price_minor = 100 where id = $1", [id]));
    expect(e.message).toContain("WB022");
    await q(db, manager, "update public.appointments set price_minor = 50000 where id = $1", [id]);
    const managed = await bookAppointment(db, manager, k, { pet: k.pets[2], service: k.swim, day: d, time: "13:00", price: 60000 });
    const [row] = await q<{ price_minor: string }>(db, staff, "select price_minor from public.appointments where id = $1", [managed]);
    expect(Number(row.price_minor)).toBe(60000);
  });

  it("on quote: staff write a request; it holds nothing until an owner or manager prices it", async () => {
    const d = await day(db, k, 6);
    const id = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.training, day: d, time: "10:00", status: "requested" });
    const confirm = await fails(staff, () => q(db, staff, "update public.appointments set status = 'confirmed' where id = $1", [id]));
    expect(confirm.message).toContain("WB199");
    const direct = await fails(staff, () => bookAppointment(db, staff, k, { pet: k.pets[1], service: k.training, day: d, time: "12:00" }));
    expect(direct.message).toContain("WB199");
    await q(db, manager, "update public.appointments set price_minor = 70000, status = 'confirmed' where id = $1", [id]);
  });
});

describe("states", () => {
  it("is done only once the certificates are seen, here or at the stay's check-in", async () => {
    const d = await day(db, k, 7);
    const id = await bookAppointment(db, staff, k, { pet: k.pets[0], service: k.swim, day: d, time: "09:00", staff });
    const e = await fails(staff, () => q(db, staff, "update public.appointments set status = 'done', life_jacket = true where id = $1", [id]));
    expect(e.message).toContain("WB194");
    await q(db, staff, "update public.appointments set status = 'done', life_jacket = true, vaccinations_checked_at = now() where id = $1", [id]);
    const [row] = await q<{ done_by: string; vaccinations_checked_by: string }>(db, staff, "select done_by, vaccinations_checked_by from public.appointments where id = $1", [id]);
    expect(row).toEqual({ done_by: staff, vaccinations_checked_by: staff });
  });

  it("stays cancelled once cancelled, with a reason", async () => {
    const d = await day(db, k, 7);
    const id = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.swim, day: d, time: "12:00" });
    const noReason = await fails(staff, () => q(db, staff, "update public.appointments set status = 'cancelled' where id = $1", [id]));
    expect(noReason.message).toContain("appointments_cancel_has_reason");
    await q(db, staff, "update public.appointments set status = 'cancelled', cancel_reason = 'Parent asked' where id = $1", [id]);
    const back = await fails(staff, () => q(db, staff, "update public.appointments set status = 'confirmed', cancel_reason = null where id = $1", [id]));
    expect(back.message).toContain("WB198");
  });
});

describe("a boarder's appointment", () => {
  let stay: string;
  let start: string;
  let end: string;

  beforeAll(async () => {
    start = await day(db, k, 10);
    end = await day(db, k, 13);
    stay = await book(db, k, { pet: k.pets[2], start, end, kennel: k.kennels[0] });
  });

  it("is on a day of its stay, check-out day included", async () => {
    const before = await fails(staff, () => bookAppointment(db, staff, k, { pet: k.pets[2], service: k.swim, day: tomorrow, time: "16:00", booking: stay }));
    expect(before.message).toContain("WB193");
    await bookAppointment(db, staff, k, { pet: k.pets[2], service: k.groom, day: end, time: "09:00", minutes: 120, booking: stay });
  });

  it("is a line on the stay's bill, which staff issue only with it", async () => {
    const [b] = await q<{ kind: "boarding"; start_date: string; end_date: string; rate_minor: number; discount_minor: number; tax_rate_bp: number; sac_code: null }>(
      db, staff, "select kind, start_date::text, end_date::text, rate_minor::int, discount_minor::int, tax_rate_bp, sac_code from public.bookings where id = $1", [stay],
    );
    const stayOnly = bookingLines("Bruno", b, []);
    const withGroom = [...stayOnly, ...(await appointmentBillLines(db, staff, k, { booking: stay }))];
    expect(withGroom.map((l) => l.description)).toEqual([expect.stringContaining("Boarding: Bruno, 3 nights"), expect.stringMatching(/^Full groom for Bruno \(\d+ \w{3}, 09:00\)$/)]);
    const without = await fails(staff, () => issueBill(db, staff, k, { booking: stay }, totals(stayOnly)));
    expect(without.message).toContain("WB050");
    await issueBill(db, staff, k, { booking: stay }, totals(withGroom));
  });

  it("never has a bill of its own", async () => {
    const [{ id }] = await q<{ id: string }>(db, staff, "select id from public.appointments where booking_id = $1", [stay]);
    const e = await fails(staff, () => issueBill(db, staff, k, { appointment: id }, totals(stayOnlyLine())));
    expect(e.message).toContain("WB200");
  });

  it("is cancelled with its stay, or when the stay no longer has its day", async () => {
    const s = await day(db, k, 20);
    const e = await day(db, k, 24);
    const other = await book(db, k, { pet: k.pets[1], start: s, end: e, kennel: k.kennels[1] });
    const first = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.swim, day: s, time: "10:00", booking: other });
    const last = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.groom, day: e, time: "09:00", minutes: 120, booking: other });
    await q(db, staff, "update public.bookings set end_date = $2 where id = $1", [other, await day(db, k, 22)]);
    const status = async (id: string) => (await q<{ status: string; cancel_reason: string | null }>(db, staff, "select status, cancel_reason from public.appointments where id = $1", [id]))[0];
    expect(await status(last)).toEqual({ status: "cancelled", cancel_reason: "The stay changed and no longer has this day" });
    expect((await status(first)).status).toBe("confirmed");
    await q(db, staff, "update public.bookings set status = 'cancelled', cancel_reason = 'Plans changed' where id = $1", [other]);
    expect(await status(first)).toEqual({ status: "cancelled", cancel_reason: "The stay was cancelled" });
  });
});

const stayOnlyLine = () => [{ description: "Something", quantity: 1, unitPriceMinor: 100, taxRateBp: 0 }];

describe("a visitor's appointment and its add-ons", () => {
  it("has a bill of its own, with its add-ons priced by the database, which staff issue as it comes to", async () => {
    const d = await day(db, k, 8);
    const id = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.groom, day: d, time: "14:00", minutes: 120 });
    await q(db, staff, "insert into public.appointment_items (org_id, appointment_id, service_id, unit_price_minor) values ($1, $2, $3, 1)", [k.org, id, k.nails]);
    const [item] = await q<{ description: string; unit_price_minor: string }>(db, staff, "select description, unit_price_minor from public.appointment_items where appointment_id = $1", [id]);
    expect({ ...item, unit_price_minor: Number(item.unit_price_minor) }).toEqual({ description: "Nail trim", unit_price_minor: 20000 });
    const changed = await fails(staff, () => q(db, staff, "update public.appointment_items set unit_price_minor = 0 where appointment_id = $1", [id]));
    expect(changed.message).toContain("WB025");
    const notAddon = await fails(staff, () => q(db, staff, "insert into public.appointment_items (org_id, appointment_id, service_id, unit_price_minor) values ($1, $2, $3, 0)", [k.org, id, k.swim]));
    expect(notAddon.message).toContain("WB203");

    const lines = await appointmentBillLines(db, staff, k, { appointment: id });
    expect(lines.map((l) => l.unitPriceMinor)).toEqual([100000, 20000]);
    const wrong = await fails(staff, () => issueBill(db, staff, k, { appointment: id }, totals(lines.slice(0, 1))));
    expect(wrong.message).toContain("WB050");
    await issueBill(db, staff, k, { appointment: id }, totals(lines));
  });
});

describe("another kennel", () => {
  it("sees none of it and cannot book with this kennel's services", async () => {
    const other = await seedKennel(db);
    const n = await q<{ n: number }>(db, other.owner, "select (select count(*) from public.appointments) + (select count(*) from public.appointment_services) + (select count(*) from public.appointment_places) as n");
    expect(Number(n[0].n)).toBe(0);
    const e = await errorOf(() => bookAppointment(db, other.owner, other, { pet: other.pets[0], service: k.swim, day: tomorrow, time: "10:00" }));
    expect(e.message).toContain("WB190");
  });
});
