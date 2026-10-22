import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookingLines } from "../../src/lib/billing";
import { healthProblems } from "../../src/lib/core";
import { addMember, book } from "./fixtures";
import { as, createTestDb, errorOf, user } from "./harness";
import { dayFromToday, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Roadmap M39 and M40: pick-up and drop from home, priced by the area, on the
 * stay's bill and on a rider's run; and health papers at the door, refused by
 * the database while the kennel says so, unless a manager lets the pet in.
 */

let db: PGlite;
let k: Kitchen;
let staff: string;
let manager: string;
let rider: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKitchen(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  rider = await addMember(db, k, "rider");
});
afterAll(() => db.close());


const addTrip = (actor: string, booking: string, kind: "pickup" | "drop", time: string, address = k.address, price: number | null = null) =>
  q<{ id: string; trip_date: string; slot: string; price_minor: string }>(
    db, actor,
    `insert into public.trips (org_id, booking_id, client_id, pet_id, kind, at_time, address_id, price_minor)
     select b.org_id, b.id, b.client_id, b.pet_id, $2, $3, $4, $5 from public.bookings b where b.id = $1
     returning id, trip_date::text, slot, price_minor::text`,
    [booking, kind, time, address, price],
  );

describe("pick-up and drop (M39)", () => {
  let stay: string;
  let start: string;
  let end: string;

  beforeAll(async () => {
    start = await dayFromToday(db, k, 0);
    end = await dayFromToday(db, k, 3);
    stay = await book(db, k, { pet: k.pets[0], start, end, kennel: k.kennels[0] });
  });

  it("go on the stay's first and last days, in the slot of their time, at the area's charge", async () => {
    const [pickup] = await addTrip(staff, stay, "pickup", "09:00");
    expect([pickup.trip_date, pickup.slot, pickup.price_minor]).toEqual([start, "morning", "5000"]);
    await q(db, k.owner, "update public.service_areas set trip_charge_minor = 8000 where org_id = $1", [k.org]);
    const [drop] = await addTrip(staff, stay, "drop", "18:30", k.address, 1);
    expect([drop.trip_date, drop.slot, drop.price_minor]).toEqual([end, "evening", "8000"]);
    const twice = await errorOf(() => addTrip(staff, stay, "drop", "17:00"));
    expect(twice.message).toContain("trips_one_of_each_per_stay");
  });

  it("outside the areas served are priced by an owner or manager; staff never change a price", async () => {
    const [{ id: far }] = await q<{ id: string }>(db, staff, "insert into public.client_addresses (org_id, client_id, line, postal_code) values ($1, $2, 'Far away', '110001') returning id", [k.org, k.client]);
    const other = await book(db, k, { pet: k.pets[1], start: await dayFromToday(db, k, 10), end: await dayFromToday(db, k, 12), kennel: k.kennels[1] });
    const e = await errorOf(() => addTrip(staff, other, "pickup", "10:00", far));
    expect(e.message).toContain("WB215");
    const [t] = await addTrip(manager, other, "pickup", "10:00", far, 30000);
    expect(t.price_minor).toBe("30000");
    const change = await errorOf(() => q(db, staff, "update public.trips set price_minor = 0 where id = $1", [t.id]));
    expect(change.message).toContain("WB022");
  });

  it("are lines on the stay's bill, which staff issue only with them", async () => {
    const [b] = await q<{ kind: "boarding"; start_date: string; end_date: string; rate_minor: number; discount_minor: number; tax_rate_bp: number; sac_code: null }>(
      db, staff, "select kind, start_date::text, end_date::text, rate_minor::int, discount_minor::int, tax_rate_bp, sac_code from public.bookings where id = $1", [stay],
    );
    const stayOnly = bookingLines("Bruno", b, []);
    const trips = [5000, 8000].map((p, i) => ({ description: i ? "Drop" : "Pick-up", quantity: 1, unitPriceMinor: p, taxRateBp: 0, sacCode: null }));
    const { billFor, draftPayload } = await import("../../src/lib/billing");
    const issue = (lines: typeof stayOnly) =>
      as(db, user(staff), async () => {
        await db.exec("begin");
        try {
          const r = await db.query<{ id: string }>("insert into public.invoices (org_id, client_id, booking_id) values ($1, $2, $3) returning id", [k.org, k.client, stay]);
          const { p_totals, p_lines } = draftPayload(billFor({ tax_mode: "none", gst_state_code: null, prices_include_tax: false, round_invoice_totals: true }, lines));
          await db.query("select public.save_invoice_draft($1, $2, $3)", [r.rows[0].id, JSON.stringify(p_totals), JSON.stringify(p_lines)]);
          await db.query("select public.issue_invoice($1)", [r.rows[0].id]);
          await db.exec("commit");
        } catch (e) {
          await db.exec("rollback");
          throw e;
        }
      });
    expect((await errorOf(() => issue(stayOnly))).message).toContain("WB050");
    await issue([...stayOnly, ...trips]);
  });

  it("move with the stay's dates, and are cancelled with it", async () => {
    const s = await dayFromToday(db, k, 30);
    const other = await book(db, k, { pet: k.pets[2], start: s, end: await dayFromToday(db, k, 32), kennel: k.kennels[0] });
    const [t] = await addTrip(staff, other, "drop", "11:00");
    await q(db, staff, "update public.bookings set end_date = $2 where id = $1", [other, await dayFromToday(db, k, 33)]);
    const [{ trip_date }] = await q<{ trip_date: string }>(db, staff, "select trip_date::text from public.trips where id = $1", [t.id]);
    expect(trip_date).toBe(await dayFromToday(db, k, 33));
    await q(db, staff, "update public.bookings set status = 'cancelled', cancel_reason = 'Plans changed' where id = $1", [other]);
    const [{ status }] = await q<{ status: string }>(db, staff, "select status from public.trips where id = $1", [t.id]);
    expect(status).toBe("cancelled");
  });

  it("go on a run of their own day and slot, and the rider marks only their own today", async () => {
    const [{ id: run }] = await q<{ id: string }>(db, staff, "insert into public.delivery_runs (org_id, run_date, slot, rider_id) values ($1, $2, 'morning', $3) returning id", [k.org, start, rider]);
    const [{ id: evening }] = await q<{ id: string }>(db, staff, "select id from public.trips where booking_id = $1 and kind = 'drop'", [stay]);
    const wrong = await errorOf(() => q(db, staff, "update public.trips set run_id = $2 where id = $1", [evening, run]));
    expect(wrong.message).toContain("WB171");
    const [{ id: pickup }] = await q<{ id: string }>(db, staff, "select id from public.trips where booking_id = $1 and kind = 'pickup'", [stay]);
    await q(db, staff, "update public.trips set run_id = $2, run_position = 1 where id = $1", [pickup, run]);
    const [{ runs }] = await q<{ runs: { stops: { trip_id?: string; kind: string; time: string; name: string }[] }[] }>(db, rider, "select public.my_runs() as runs");
    expect(runs[0].stops.map((s) => [s.trip_id, s.kind, s.time])).toEqual([[pickup, "pickup", "09:00"]]);
    // A rider reaches no table.
    expect(await q(db, rider, "select id from public.trips")).toEqual([]);
    await q(db, rider, "select public.rider_mark_trip($1, 'done')", [pickup]);
    const other = await addMember(db, k, "rider");
    const e = await errorOf(() => q(db, other, "select public.rider_mark_trip($1, 'done')", [pickup]));
    expect(e.message).toContain("WB003");
  });
});

describe("health papers at the door (M40)", () => {
  let stay: string;
  const pet = () => k.pets[1];

  beforeAll(async () => {
    await q(db, manager, "update public.organizations set health_check = 'refuse', deworm_days = 90 where id = $1", [k.org]);
    await q(db, manager, "insert into public.required_vaccines (org_id, vaccine, months_valid) values ($1, 'Rabies', 12)", [k.org]);
    stay = await book(db, k, { pet: pet(), start: await dayFromToday(db, k, 0), end: await dayFromToday(db, k, 2), kennel: k.kennels[2] });
  });

  it("refuses check-in for a pet that lacks what the kennel requires, saying what", async () => {
    const e = await errorOf(() => q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [stay]));
    expect(e.message).toContain("WB210: this pet lacks what the kennel requires at the door: Rabies, deworming");
  });

  it("agrees with the app's own reading of the rules", async () => {
    const today = await dayFromToday(db, k, 0);
    await q(db, staff, "insert into public.vaccinations (org_id, pet_id, vaccine, given_on) values ($1, $2, 'rabies', $3)", [k.org, pet(), await dayFromToday(db, k, -400)]);
    const db_ = await q<{ problem: string; detail: string }>(db, staff, "select problem, detail from public.pet_health_problems($1, $2, $3)", [k.org, pet(), today]);
    const ts = healthProblems(
      { date_of_birth: null, is_neutered: null, dewormed_on: null, tick_treated_on: null, vaccinations: [{ vaccine: "rabies", given_on: await dayFromToday(db, k, -400), valid_until: null }] },
      { required: [{ vaccine: "Rabies", months_valid: 12 }], deworm_days: 90, tick_days: null, neuter_months: null },
      today,
    );
    expect(db_.map((x) => x.problem)).toEqual(ts.map((x) => x.problem));
  });

  it("lets the pet in once an owner or manager says why; staff cannot", async () => {
    const e = await errorOf(() => q(db, staff, "insert into public.health_overrides (org_id, booking_id, reason) values ($1, $2, 'Card at home')", [k.org, stay]));
    expect(e.message).toContain("row-level security");
    await q(db, manager, "insert into public.health_overrides (org_id, booking_id, reason) values ($1, $2, 'Card at home, vet confirmed on the phone')", [k.org, stay]);
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [stay]);
  });

  it("lets a pet in date through, and only warns while the kennel says warn", async () => {
    const other = await book(db, k, { pet: k.pets[2], start: await dayFromToday(db, k, 6), end: await dayFromToday(db, k, 7) });
    await q(db, staff, "update public.pets set dewormed_on = current_date - 10 where id = $1", [k.pets[2]]);
    await q(db, staff, "insert into public.vaccinations (org_id, pet_id, vaccine, valid_until) values ($1, $2, 'RABIES', current_date + 100)", [k.org, k.pets[2]]);
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [other]);
    await q(db, manager, "update public.organizations set health_check = 'warn' where id = $1", [k.org]);
    const third = await book(db, k, { pet: k.pets[0], start: await dayFromToday(db, k, 8), end: await dayFromToday(db, k, 9) });
    await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [third]);
  });
});
