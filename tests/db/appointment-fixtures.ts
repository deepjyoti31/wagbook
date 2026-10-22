import type { PGlite } from "@electric-sql/pglite";
import { billFor, draftPayload } from "../../src/lib/billing";
import { appointmentLines, zonedInstant, type BillableAddOn, type BillableAppointment, type InvoiceTotals } from "../../src/lib/core";
import { seedKennel, type Kennel } from "./fixtures";
import { as, user } from "./harness";
import { dayFromToday, q } from "./kitchen-fixtures";

/**
 * A kennel offering appointments (Phase 2): a pool and a grooming table open
 * 09:00 to 18:00, a swim (60 minutes and 30 to clean up, ₹800), a full groom
 * priced by coat (₹1,000; double coat ₹1,200; Golden Retriever ₹1,500), nails
 * as an add-on (₹200), training on quote, and a party for five people at most.
 */
export interface Appointments extends Kennel {
  pool: string;
  table: string;
  yard: string;
  swim: string;
  groom: string;
  nails: string;
  training: string;
  party: string;
}

export async function seedAppointments(db: PGlite): Promise<Appointments> {
  const k = await seedKennel(db);
  const o = k.owner;
  await q(db, o, "update public.organizations set offers_appointments = true where id = $1", [k.org]);
  const place = async (name: string) =>
    (await q<{ id: string }>(db, o, "insert into public.appointment_places (org_id, name) values ($1, $2) returning id", [k.org, name]))[0].id;
  const pool = await place("Pool");
  const table = await place("Grooming table");
  const yard = await place("Party yard");
  const service = async (kind: string, name: string, minutes: number, placeId: string | null, price: number, extra: Record<string, unknown> = {}) => {
    const cols = ["org_id", "kind", "name", "minutes", "place_id", "price_minor", ...Object.keys(extra)];
    const vals = [k.org, kind, name, minutes, placeId, price, ...Object.values(extra)];
    const sql = `insert into public.appointment_services (${cols.join(", ")}) values (${cols.map((_, i) => `$${i + 1}`).join(", ")}) returning id`;
    return (await q<{ id: string }>(db, o, sql, vals))[0].id;
  };
  const swim = await service("swim", "Swim", 60, pool, 80000, { cleanup_minutes: 30, skill: "swim_supervisor" });
  const groom = await service("groom", "Full groom", 120, table, 100000, { pricing: "by_coat", skill: "groomer" });
  await q(db, o, "insert into public.appointment_service_prices (org_id, service_id, coat, price_minor) values ($1, $2, 'double', 120000)", [k.org, groom]);
  await q(db, o, "insert into public.appointment_service_prices (org_id, service_id, breed, price_minor) values ($1, $2, 'Golden Retriever', 150000)", [k.org, groom]);
  const nails = await service("groom", "Nail trim", 0, null, 20000, { is_addon: true });
  const training = await service("training", "Training session", 60, yard, 0, { pricing: "quote", checks_vaccinations: false });
  const party = await service("party", "Birthday party", 180, yard, 300000, { max_people: 5 });
  return { ...k, pool, table, yard, swim, groom, nails, training, party };
}

/** The instant of a kennel-local day and time ("10:00"), for Asia/Kolkata, as an ISO string. */
export function at(day: string, time: string): string {
  return zonedInstant(day, time, "Asia/Kolkata").toISOString();
}

export { dayFromToday, q };

export interface NewAppointment {
  pet: string;
  service: string;
  day: string;
  time: string;
  minutes?: number;
  status?: string;
  booking?: string | null;
  staff?: string | null;
  price?: number | null;
  place?: string | null;
  course?: string | null;
}

/** Book an appointment as `actor`, returning its id. The parent is the pet's own. */
export async function bookAppointment(db: PGlite, actor: string, k: Kennel, a: NewAppointment): Promise<string> {
  const start = at(a.day, a.time);
  const end = new Date(new Date(start).getTime() + (a.minutes ?? 60) * 60_000).toISOString();
  const rows = await q<{ id: string }>(
    db, actor,
    `insert into public.appointments (org_id, client_id, pet_id, service_id, starts_at, ends_at, status, booking_id, staff_id, price_minor, place_id, course_id)
     select $1, p.client_id, p.id, $3, $4, $5, $6, $7, $8, $9, $10, $11 from public.pets p where p.org_id = $1 and p.id = $2 returning id`,
    [k.org, a.pet, a.service, start, end, a.status ?? "confirmed", a.booking ?? null, a.staff ?? null, a.price ?? null, a.place ?? null, a.course ?? null],
  );
  return rows[0].id;
}

const org = { tax_mode: "none" as const, gst_state_code: null, prices_include_tax: false, round_invoice_totals: true };

/** The lines of a pet's appointments as the app builds them (appointmentLines), from the database as it is now. */
export async function appointmentBillLines(db: PGlite, actor: string, k: Kennel, where: { booking: string } | { appointment: string }, petName = "Bruno") {
  const filter = "booking" in where ? "a.booking_id = $2" : "a.id = $2";
  const rows = await q<BillableAppointment>(
    db, actor,
    `select a.id, a.status, a.starts_at::text, s.name as service_name, a.price_minor::int, a.tax_rate_bp, a.sac_code, a.course_id, a.in_package
     from public.appointments a join public.appointment_services s on s.id = a.service_id where a.org_id = $1 and ${filter}`,
    [k.org, "booking" in where ? where.booking : where.appointment],
  );
  const items = await q<BillableAddOn>(
    db, actor,
    `select i.appointment_id, i.description, i.quantity, i.unit_price_minor::int, i.tax_rate_bp, i.sac_code
     from public.appointment_items i join public.appointments a on a.id = i.appointment_id where a.org_id = $1 and ${filter}`,
    [k.org, "booking" in where ? where.booking : where.appointment],
  );
  return appointmentLines(petName, rows.map((r) => ({ ...r, starts_at: new Date(r.starts_at).toISOString() })), items, "Asia/Kolkata");
}

export const totals = (lines: Parameters<typeof billFor>[1]): InvoiceTotals => billFor(org, lines);

/** Save a bill as a draft for a booking or an appointment and issue it, as `actor`. Returns its id. */
export async function issueBill(db: PGlite, actor: string, k: Kennel, scope: { booking: string } | { appointment: string }, t: InvoiceTotals): Promise<string> {
  // In one transaction, so a refused bill leaves no draft behind.
  return as(db, user(actor), async () => {
    await db.exec("begin");
    try {
      const id = await draft();
      await db.exec("commit");
      return id;
    } catch (e) {
      await db.exec("rollback");
      throw e;
    }
  });
  async function draft() {
    const col = "booking" in scope ? "booking_id" : "appointment_id";
    const r = await db.query<{ id: string }>(`insert into public.invoices (org_id, client_id, ${col}) values ($1, $2, $3) returning id`, [
      k.org, k.client, "booking" in scope ? scope.booking : scope.appointment,
    ]);
    const { p_totals, p_lines } = draftPayload(t);
    await db.query("select public.save_invoice_draft($1, $2, $3)", [r.rows[0].id, JSON.stringify(p_totals), JSON.stringify(p_lines)]);
    await db.query("select public.issue_invoice($1)", [r.rows[0].id]);
    return r.rows[0].id;
  }
}

/** A day `n` days from the kennel's today. */
export const day = (db: PGlite, k: Kennel, n: number) => dayFromToday(db, k, n);
