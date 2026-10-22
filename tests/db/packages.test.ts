import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { bookingLines } from "../../src/lib/billing";
import { localClock, localDate, toStayCharges } from "../../src/lib/core";
import { appointmentBillLines, bookAppointment, day, issueBill, q, seedAppointments, totals, type Appointments } from "./appointment-fixtures";
import { addMember, book } from "./fixtures";
import { createTestDb, errorOf } from "./harness";

/**
 * Roadmap M37: packages. A stay with a package is billed as one line; adding
 * it books its parts (extras, and appointments at the first free time on
 * their day, a groom on the last day finished by pick-up); the parts cost
 * nothing on their own; cancelling the stay cancels them.
 */

let db: PGlite;
let k: Appointments;
let staff: string;
let manager: string;
let holiday: string;
let onRequest: string;
let play: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedAppointments(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  const o = k.owner;
  [{ id: play }] = await q<{ id: string }>(db, o, "insert into public.services (org_id, kind, name, price_minor) values ($1, 'addon', 'Extra play', 30000) returning id", [k.org]);
  [{ id: holiday }] = await q<{ id: string }>(db, o, "insert into public.packages (org_id, name, price_minor) values ($1, 'Holiday package', 1500000) returning id", [k.org]);
  [{ id: onRequest }] = await q<{ id: string }>(db, o, "insert into public.packages (org_id, name) values ($1, 'Long holiday') returning id", [k.org]);
  for (const pkg of [holiday, onRequest]) {
    await q(db, o, "insert into public.package_parts (org_id, package_id, extra_id, quantity, sort_order) values ($1, $2, $3, 3, 1)", [k.org, pkg, play]);
    await q(db, o, "insert into public.package_parts (org_id, package_id, service_id, on_day, sort_order) values ($1, $2, $3, 'middle', 2)", [k.org, pkg, k.swim]);
    await q(db, o, "insert into public.package_parts (org_id, package_id, service_id, on_day, sort_order) values ($1, $2, $3, 'last', 3)", [k.org, pkg, k.groom]);
  }
});
afterAll(() => db.close());

const apply = (actor: string, booking: string, pkg: string, price: number | null = null) =>
  q<{ left: number }>(db, actor, "select public.apply_package($1, $2, $3) as left", [booking, pkg, price]);

describe("a package on a stay", () => {
  let stay: string;
  let start: string;
  let end: string;

  beforeAll(async () => {
    start = await day(db, k, 10);
    end = await day(db, k, 17);
    stay = await book(db, k, { pet: k.pets[0], start, end, kennel: k.kennels[0] });
  });

  it("goes on only through Add a package", async () => {
    const e = await errorOf(() => q(db, manager, "update public.bookings set package_id = $2, package_price_minor = 1, rate_minor = 0 where id = $1", [stay, holiday]));
    expect(e.message).toContain("WB205");
  });

  it("books its parts: the extras at no charge, the swim on the middle day, the groom on the last day by pick-up", async () => {
    const [{ left }] = await apply(staff, stay, holiday);
    expect(left).toBe(0);
    const items = await q<{ description: string; quantity: string; unit_price_minor: string; in_package: boolean }>(db, staff, "select description, quantity::text, unit_price_minor::text, in_package from public.booking_items where booking_id = $1", [stay]);
    expect(items).toEqual([{ description: "Extra play", quantity: "3.00", unit_price_minor: "0", in_package: true }]);
    const appts = await q<{ kind: string; starts_at: string; ends_at: string; price_minor: string; in_package: boolean }>(db, staff, "select kind, starts_at::text, ends_at::text, price_minor::text, in_package from public.appointments where booking_id = $1 order by starts_at", [stay]);
    expect(appts.map((a) => [a.kind, localDate(a.starts_at, "Asia/Kolkata"), localClock(a.starts_at, "Asia/Kolkata"), a.price_minor, a.in_package])).toEqual([
      ["swim", await day(db, k, 13), "09:00", "0", true],
      // Two hours, finished by the kennel's check-out time of 12:00.
      ["groom", end, "10:00", "0", true],
    ]);
  });

  it("is billed as one line, which staff issue, the parts left off", async () => {
    const [b] = await q<{ kind: "boarding"; start_date: string; end_date: string; rate_minor: number; discount_minor: number; tax_rate_bp: number; sac_code: null }>(
      db, staff, "select kind, start_date::text, end_date::text, rate_minor::int, discount_minor::int, tax_rate_bp, sac_code from public.bookings where id = $1", [stay],
    );
    const charges = toStayCharges(await q(db, staff, "select part, quantity, unit_price_minor::int, discount_minor::int from public.stay_charges($1, array[$2]::uuid[])", [k.org, stay]));
    expect(charges).toEqual([{ part: "package", quantity: 1, unitPriceMinor: 1500000, discountMinor: 0 }]);
    const lines = [...bookingLines("Bruno", { ...b, charges, package_name: "Holiday package" }, []), ...(await appointmentBillLines(db, staff, k, { booking: stay }))];
    expect(lines.map((l) => [l.description, l.unitPriceMinor])).toEqual([[expect.stringMatching(/^Holiday package: Bruno, 7 nights/), 1500000]]);
    await issueBill(db, staff, k, { booking: stay }, totals(lines));
  });

  it("goes on a stay once, and stays", async () => {
    const e = await errorOf(() => apply(manager, stay, holiday));
    expect(e.message).toContain("WB205");
  });

  it("cannot be booked twice over, nor with what it does not include", async () => {
    const twice = await errorOf(() => q(db, staff, `insert into public.appointments (org_id, client_id, pet_id, service_id, booking_id, in_package, starts_at, ends_at)
      select org_id, client_id, pet_id, service_id, booking_id, true, starts_at + interval '3 hours', ends_at + interval '3 hours' from public.appointments where booking_id = $1 and kind = 'swim'`, [stay]));
    expect(twice.message).toContain("WB207");
  });
});

describe("prices, kinds and cancelling", () => {
  it("on request: set by an owner or manager, never by staff", async () => {
    const stay = await book(db, k, { pet: k.pets[1], start: await day(db, k, 20), end: await day(db, k, 23), kennel: k.kennels[1] });
    const e = await errorOf(() => apply(staff, stay, onRequest, 900000));
    expect(e.message).toContain("WB206");
    const changed = await errorOf(() => apply(staff, stay, holiday, 1));
    expect(changed.message).toContain("WB022");
    await apply(manager, stay, onRequest, 900000);
    const [b] = await q<{ package_price_minor: string; rate_minor: string }>(db, staff, "select package_price_minor::text, rate_minor::text from public.bookings where id = $1", [stay]);
    expect(b).toEqual({ package_price_minor: "900000", rate_minor: "0" });
  });

  it("is for its own kind of stay", async () => {
    const d = await day(db, k, 30);
    const daycare = await book(db, k, { pet: k.pets[2], start: d, end: d, kind: "daycare", rate: 60000 });
    const e = await errorOf(() => apply(manager, daycare, holiday));
    expect(e.message).toContain("WB204");
  });

  it("says how many appointments found no free time, to book by hand", async () => {
    const s = await day(db, k, 40);
    const e = await day(db, k, 42);
    // The pool is taken all of the middle day.
    for (const time of ["09:00", "10:30", "12:00", "13:30", "15:00", "16:30"]) {
      await bookAppointment(db, manager, k, { pet: k.pets[2], service: k.swim, day: await day(db, k, 41), time });
    }
    const stay = await book(db, k, { pet: k.pets[1], start: s, end: e, kennel: k.kennels[0] });
    const [{ left }] = await apply(staff, stay, holiday);
    expect(left).toBe(1);
  });

  it("is cancelled with its stay, appointments and all", async () => {
    const s = await day(db, k, 50);
    const stay = await book(db, k, { pet: k.pets[0], start: s, end: await day(db, k, 53), kennel: k.kennels[0] });
    await apply(staff, stay, holiday);
    await q(db, staff, "update public.bookings set status = 'cancelled', cancel_reason = 'Trip off' where id = $1", [stay]);
    const statuses = await q<{ status: string }>(db, staff, "select status from public.appointments where booking_id = $1", [stay]);
    expect(statuses.map((x) => x.status)).toEqual(["cancelled", "cancelled"]);
  });
});
