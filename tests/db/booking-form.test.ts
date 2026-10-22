import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { at, seedAppointments, type Appointments } from "./appointment-fixtures";
import { addMember } from "./fixtures";
import { anon, as, createTestDb } from "./harness";
import { dayFromToday, q } from "./kitchen-fixtures";

/**
 * Roadmap M41: a booking form for new parents. It goes through the intake
 * form's own public function (no new one), and accepting it makes the parent,
 * the pet and the request staff then confirm: a stay at the usual price, or
 * an appointment. One the kennel cannot take as asked is left to book by hand.
 */

let db: PGlite;
let k: Appointments;
let staff: string;
let slug: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedAppointments(db);
  staff = await addMember(db, k, "staff");
  slug = (await db.query<{ slug: string }>("select slug from public.organizations where id = $1", [k.org])).rows[0].slug;
  await q(db, k.owner, "insert into public.services (org_id, kind, name, unit, price_minor, is_default) values ($1, 'boarding', 'Boarding', 'night', 120000, true)", [k.org]);
});
afterAll(() => db.close());

let phone = 9811100000;
const form = (stay: Record<string, unknown>, request: Record<string, unknown>, pets = [{ name: "Simba", breed: "Indie", weight_kg: "18" }]) => ({
  v: 1,
  parent: { name: "Meera Shah", phone: `+91${++phone}` },
  pets,
  stay,
  request: { make: true, vaccinations_ok: true, ...request },
  consent: true,
});

async function sendAndAccept(payload: unknown) {
  await as(db, anon, () => db.query("select public.submit_intake($1, $2::jsonb)", [slug, JSON.stringify(payload)]));
  const [{ id }] = await q<{ id: string }>(db, staff, "select id from public.intake_submissions where org_id = $1 order by created_at desc limit 1", [k.org]);
  const [{ client }] = await q<{ client: string }>(db, staff, "select public.accept_intake($1) as client", [id]);
  return client;
}

describe("the booking form for new parents", () => {
  it("tells the form the usual prices and the services offered, for an estimate", async () => {
    const v = await as(db, anon, async () => (await db.query<{ v: { prices: { boarding: number }; services: { name: string; price_minor: number | null; from: boolean }[] } }>("select public.get_public_intake_form($1) as v", [slug])).rows[0].v);
    expect(Number(v.prices.boarding)).toBe(120000);
    expect(v.services.map((s) => [s.name, s.price_minor === null ? null : Number(s.price_minor), s.from])).toEqual(
      expect.arrayContaining([["Swim", 80000, false], ["Full groom", 100000, true], ["Training session", null, false]]),
    );
    expect(v.services.map((s) => s.name)).not.toContain("Nail trim");
  });

  it("makes a stay request at the usual price for each pet, with the pick-up asked for", async () => {
    const start = await dayFromToday(db, k, 5);
    const client = await sendAndAccept(form({ kind: "boarding", start_date: start, end_date: await dayFromToday(db, k, 8) }, { pickup: true }, [{ name: "Simba" }, { name: "Nala" }] as never));
    const stays = await q<{ status: string; source: string; rate_minor: string; notes: string; group_id: string | null }>(
      db, staff, "select status, source, rate_minor::text, notes, group_id from public.bookings where client_id = $1", [client],
    );
    expect(stays.map((s) => [s.status, s.source, s.rate_minor, s.notes])).toEqual([
      ["requested", "intake", "120000", "Asked for pick-up from home"],
      ["requested", "intake", "120000", "Asked for pick-up from home"],
    ]);
    expect(stays[0].group_id).not.toBeNull();
    expect(stays[0].group_id).toBe(stays[1].group_id);
  });

  it("makes an appointment request at the time asked", async () => {
    const day = await dayFromToday(db, k, 4);
    const client = await sendAndAccept(form({ kind: "boarding", start_date: day }, { service_id: k.swim, time: "11:00" }));
    const [a] = await q<{ status: string; starts_at: string; price_minor: string }>(db, staff, "select status, starts_at::text, price_minor::text from public.appointments where client_id = $1", [client]);
    expect([a.status, new Date(a.starts_at).toISOString(), a.price_minor]).toEqual(["requested", at(day, "11:00"), "80000"]);
  });

  it("still makes the parent and pet when the request cannot be taken as asked", async () => {
    const client = await sendAndAccept(form({ kind: "boarding", start_date: await dayFromToday(db, k, 4) }, { service_id: k.swim, time: "23:00" }));
    expect(await q(db, staff, "select id from public.appointments where client_id = $1", [client])).toEqual([]);
    expect((await q(db, staff, "select id from public.pets where client_id = $1", [client])).length).toBe(1);
    const past = await sendAndAccept(form({ kind: "boarding", start_date: await dayFromToday(db, k, -3), end_date: await dayFromToday(db, k, -1) }, {}));
    expect(await q(db, staff, "select id from public.bookings where client_id = $1", [past])).toEqual([]);
  });
});
