import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { at, bookAppointment, day, seedAppointments, type Appointments } from "./appointment-fixtures";
import { addMember, book, strangerPet } from "./fixtures";
import { admin, anon, as, createTestDb, errorOf } from "./harness";
import { dayFromToday, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Roadmap M59: more from the parent's own link. A parent asks for an
 * appointment at one of the free times, which lands as a request for staff to
 * confirm, as a stay request does; and tells the kennel a delivery went
 * wrong, with a photo that only they can add, once, within the hour. Both go
 * through the link's existing functions: still twelve for the anonymous role.
 */

let db: PGlite;
let k: Appointments;
let staff: string;
let token: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedAppointments(db);
  staff = await addMember(db, k, "staff");
  [{ token }] = await q<{ token: string }>(db, staff, "select public.renew_request_link($1) as token", [k.client]);
});
afterAll(() => db.close());

type Form = {
  appointment_services: { id: string; name: string }[] | null;
  free_times: string[] | null;
  appointments: { pet: string; service: string; status: string; date: string; time: string }[] | null;
  food: { id: string; recent: { id: string; date: string; reported: boolean }[] | null }[] | null;
};
const form = (t: string, service: string | null = null, onDay: string | null = null) =>
  as(db, anon, async () => (await db.query<{ v: Form }>("select public.get_public_booking_form($1, $2, $3) as v", [t, service, onDay])).rows[0].v);
const ask = (appointment: object, t = token) =>
  as(db, anon, async () => (await db.query<{ n: number }>("select public.submit_booking_request($1, $2) as n", [t, JSON.stringify({ appointment })])).rows[0].n);

describe("asking for an appointment from the parent's link", () => {
  it("offers the services and the free times of a day, without the times taken", async () => {
    const d = await day(db, k, 2);
    await bookAppointment(db, staff, k, { pet: await strangerPet(db, k), service: k.swim, day: d, time: "10:00" });
    const v = await form(token, k.swim, d);
    expect(v.appointment_services?.map((s) => s.name).sort()).toEqual(["Birthday party", "Full groom", "Swim", "Training session"]);
    // The pool is taken 10:00 to 11:30 with its clean-up; a swim at 09:00 would still be cleaned at 10:00.
    for (const taken of ["09:00", "09:30", "10:00", "10:30", "11:00"]) expect(v.free_times).not.toContain(taken);
    expect(v.free_times?.[0]).toBe("11:30");
    // No times without a day, and none too far ahead.
    expect((await form(token)).free_times).toBeNull();
    expect((await form(token, k.swim, await day(db, k, 61))).free_times).toBeNull();
  });

  it("lands as a request from the parent, priced as the kennel prices it, holding nothing", async () => {
    const d = await day(db, k, 3);
    expect(await ask({ pet_id: k.pets[0], service_id: k.groom, date: d, time: "09:00", note: "Short on the ears" })).toBe(1);
    const [a] = await q<{ status: string; source: string; price_minor: number; notes: string; starts_at: string; booking_id: string | null }>(
      db, staff,
      "select status, source, price_minor::int, notes, starts_at::text, booking_id from public.appointments where pet_id = $1 and service_id = $2",
      [k.pets[0], k.groom],
    );
    expect([a.status, a.source, a.price_minor, a.notes, a.booking_id]).toEqual(["requested", "parent", 100000, "Short on the ears", null]);
    expect(new Date(a.starts_at).toISOString()).toBe(at(d, "09:00"));
    // It holds nothing: staff may still book the table at that time.
    await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.groom, day: d, time: "09:00", minutes: 120 });
    const shown = (await form(token)).appointments ?? [];
    expect(shown.find((x) => x.service === "Full groom" && x.status === "requested")?.time).toBe("09:00");
  });

  it("goes on the pet's stay when it is staying that day", async () => {
    const start = await day(db, k, 5);
    const stay = await book(db, k, { pet: k.pets[2], start, end: await day(db, k, 7) });
    await ask({ pet_id: k.pets[2], service_id: k.swim, date: await day(db, k, 6), time: "14:00" });
    const [a] = await q<{ booking_id: string }>(db, staff, "select booking_id from public.appointments where pet_id = $1 and service_id = $2", [k.pets[2], k.swim]);
    expect(a.booking_id).toBe(stay);
  });

  it("refuses another parent's pet, an add-on, a time that is not free and a day too far", async () => {
    const d = await day(db, k, 4);
    const tries: [object, string][] = [
      [{ pet_id: await strangerPet(db, k), service_id: k.swim, date: d, time: "09:00" }, "WB102"],
      [{ pet_id: k.pets[0], service_id: k.nails, date: d, time: "09:00" }, "WB272"],
      [{ pet_id: k.pets[0], service_id: k.client, date: d, time: "09:00" }, "WB272"],
      [{ pet_id: k.pets[0], service_id: k.swim, date: d, time: "09:15" }, "WB273"],
      [{ pet_id: k.pets[0], service_id: k.swim, date: d, time: "17:30" }, "WB273"],
      [{ pet_id: k.pets[0], service_id: k.swim, date: d, time: "9am" }, "WB273"],
      [{ pet_id: k.pets[0], service_id: k.swim, date: await day(db, k, -1), time: "10:00" }, "WB273"],
      [{ pet_id: k.pets[0], service_id: k.swim, date: await day(db, k, 61), time: "10:00" }, "WB273"],
    ];
    for (const [payload, code] of tries) expect((await errorOf(() => ask(payload))).message, JSON.stringify(payload)).toContain(code);
    expect((await errorOf(() => ask({ pet_id: k.pets[0], service_id: k.swim, date: d, time: "09:00" }, "f".repeat(64)))).message).toContain("WB100");
  });

  it("stops at six requests a day, and when the kennel stops offering appointments", async () => {
    const d = await day(db, k, 10);
    const [{ n: already }] = await q<{ n: number }>(db, staff, "select count(*)::int as n from public.appointments where source = 'parent' and client_id = $1", [k.client]);
    for (let i = already; i < 6; i++) await ask({ pet_id: k.pets[0], service_id: k.training, date: d, time: `${10 + i}:00` });
    expect((await errorOf(() => ask({ pet_id: k.pets[1], service_id: k.training, date: d, time: "09:00" }))).message).toContain("WB105");
    await q(db, k.owner, "update public.organizations set offers_appointments = false where id = $1", [k.org]);
    expect((await form(token)).appointment_services).toBeNull();
    expect((await errorOf(() => ask({ pet_id: k.pets[1], service_id: k.swim, date: d, time: "09:00" }))).message).toContain("WB100");
    await q(db, k.owner, "update public.organizations set offers_appointments = true where id = $1", [k.org]);
  });

  it("never lets staff say a parent asked for one", async () => {
    const id = await bookAppointment(db, staff, k, { pet: k.pets[1], service: k.swim, day: await day(db, k, 8), time: "09:00" });
    await q(db, staff, "update public.appointments set source = 'parent' where id = $1", [id]);
    const [a] = await q<{ source: string }>(db, staff, "select source from public.appointments where id = $1", [id]);
    expect(a.source).toBe("staff");
  });
});

describe("telling the kennel a delivery went wrong", () => {
  let f: Kitchen;
  let link: string;
  let delivered: string;
  let later: string;

  beforeAll(async () => {
    f = await seedKitchen(db);
    [{ token: link }] = await q<{ token: string }>(db, f.owner, "select public.renew_request_link($1) as token", [f.client]);
    const [{ id: sub }] = await q<{ id: string }>(
      db, f.owner,
      "insert into public.subscriptions (org_id, client_id, pet_id, product_id, grams_per_day, weekdays, address_id, starts_on) values ($1, $2, $3, $4, 400, '{1,2,3,4,5,6,7}', $5, $6) returning id",
      [f.org, f.client, f.pets[0], f.subscriptionFood, f.address, await dayFromToday(db, f, 1)],
    );
    await q(db, f.owner, "select public.plan_subscription($1, $2)", [sub, await dayFromToday(db, f, 6)]);
    const ids = await q<{ id: string }>(db, f.owner, "select id from public.deliveries where subscription_id = $1 order by delivery_date", [sub]);
    [delivered, later] = [ids[0].id, ids[1].id];
    await deliver(f, [delivered, later]);
  });

  /** Cook a batch and mark deliveries as handed over now. */
  async function deliver(kitchen: Kitchen, deliveries: string[]) {
    const today = await dayFromToday(db, kitchen, 0);
    await q(db, kitchen.owner, "select public.record_purchase($1, $2, 10000, 220000, $3)", [kitchen.org, kitchen.chicken, today]);
    await q(db, kitchen.owner, "select public.record_purchase($1, $2, 10000, 60000, $3)", [kitchen.org, kitchen.rice, today]);
    await q(db, kitchen.owner, "select public.record_purchase($1, $2, 10000, 260000, $3)", [kitchen.org, kitchen.fish, today]);
    // One batch for each recipe of the rotation, so each delivery is packed from its own.
    const batches: string[] = [];
    for (const v of kitchen.versions) batches.push((await q<{ id: string }>(db, kitchen.owner, "select public.record_batch($1, $2, 3000, 10, $3) as id", [kitchen.org, v, today]))[0].id);
    await as(db, admin, () =>
      db.query("update public.deliveries set batch_id = case when version_id = $2 then $3 else $4 end::uuid, status = 'delivered', delivered_at = now() where id = any($1)", [
        deliveries, kitchen.versions[0], batches[0], batches[1],
      ]));
  }

  const tell = (payload: object, t = link) =>
    as(db, anon, async () => (await db.query<{ path: string | null }>("select public.submit_food_request($1, $2) as path", [t, JSON.stringify({ kind: "problem", ...payload })])).rows[0].path);

  /** An anonymous upload, as Storage would make it with the parent's link secret. */
  async function upload(name: string, header: string | null = link) {
    await db.query("select set_config('request.headers', $1, false)", [header === null ? "" : JSON.stringify({ "x-wagbook-link": header })]);
    try {
      await as(db, anon, () => db.query("insert into storage.objects (bucket_id, name) values ('pet-media', $1)", [name]));
    } finally {
      await db.query("select set_config('request.headers', '', false)");
    }
  }

  it("lists the deliveries handed over within the window, and lands where staff see problems", async () => {
    const v = await form(link);
    expect(v.food?.[0].recent?.map((r) => r.id).sort()).toEqual([delivered, later].sort());
    const path = await tell({ delivery_id: delivered, problem: "damaged", note: "The pack was torn", photo: true });
    expect(path).toMatch(new RegExp(`^${f.org}/deliveries/${delivered}/problem-[0-9a-f-]{36}\\.jpg$`));
    const [p] = await q<{ kind: string; note: string; from_parent: boolean; photo_path: string; reported_by: string | null }>(
      db, f.owner, "select kind, note, from_parent, photo_path, reported_by from public.delivery_problems where delivery_id = $1", [delivered]);
    expect([p.kind, p.note, p.from_parent, p.photo_path, p.reported_by]).toEqual(["damaged", "The pack was torn", true, path, null]);
    expect((await form(link)).food?.[0].recent?.find((r) => r.id === delivered)?.reported).toBe(true);

    // The photo goes in once, at that path, with the link's secret.
    await upload(path!);
    expect((await errorOf(() => upload(path!))).message).toMatch(/duplicate key|unique/);
    expect((await errorOf(() => upload(`${f.org}/deliveries/${delivered}/problem-other.jpg`))).message).toMatch(/row-level security/);
    expect((await errorOf(() => upload(`${f.org}/pets/${f.pets[0]}/profile.jpg`))).message).toMatch(/row-level security/);
  });

  it("is told once per delivery, about the parent's own deliveries, within the window", async () => {
    expect((await errorOf(() => tell({ delivery_id: delivered, problem: "late" }))).message).toContain("WB274");
    const other = await seedKitchen(db);
    expect((await errorOf(() => tell({ delivery_id: other.client, problem: "late" }))).message).toContain("WB186");
    expect((await errorOf(() => tell({ delivery_id: later, problem: "cold" }))).message).toContain("WB181");
    await as(db, admin, () => db.query("update public.deliveries set delivered_at = now() - interval '3 days' where id = $1", [later]));
    expect((await errorOf(() => tell({ delivery_id: later, problem: "late" }))).message).toContain("WB174");
    expect((await form(link)).food?.[0].recent?.map((r) => r.id)).toEqual([delivered]);
  });

  it("takes no photo without a path given back, after the hour, or with another link", async () => {
    await as(db, admin, () => db.query("update public.deliveries set delivered_at = now() where id = $1", [later]));
    const none = await tell({ delivery_id: later, problem: "wrong" });
    expect(none).toBeNull();
    expect((await errorOf(() => upload(`${f.org}/deliveries/${later}/problem-x.jpg`))).message).toMatch(/row-level security/);

    const [{ path }] = await q<{ path: string }>(db, f.owner, "select photo_path as path from public.delivery_problems where delivery_id = $1", [delivered]);
    const second = path.replace(/problem-.*\.jpg$/, "problem-second.jpg");
    await as(db, admin, () => db.query("update public.delivery_problems set photo_path = $2 where delivery_id = $1", [delivered, second]));
    const [{ token: otherLink }] = await q<{ token: string }>(db, staff, "select public.renew_request_link($1) as token", [k.client]);
    expect((await errorOf(() => upload(second, otherLink))).message).toMatch(/row-level security/);
    expect((await errorOf(() => upload(second, null))).message).toMatch(/row-level security/);
    await as(db, admin, () => db.query("update public.delivery_problems set reported_at = now() - interval '61 minutes' where delivery_id = $1", [delivered]));
    expect((await errorOf(() => upload(second))).message).toMatch(/row-level security/);
  });

  it("never lets staff say a parent told it", async () => {
    const other = await seedKitchen(db);
    const [{ id: sub }] = await q<{ id: string }>(
      db, other.owner,
      "insert into public.subscriptions (org_id, client_id, pet_id, product_id, grams_per_day, weekdays, address_id, starts_on) values ($1, $2, $3, $4, 400, '{1,2,3,4,5,6,7}', $5, $6) returning id",
      [other.org, other.client, other.pets[0], other.subscriptionFood, other.address, await dayFromToday(db, other, 1)],
    );
    await q(db, other.owner, "select public.plan_subscription($1, $2)", [sub, await dayFromToday(db, other, 2)]);
    const [{ id }] = await q<{ id: string }>(db, other.owner, "select id from public.deliveries where subscription_id = $1 order by delivery_date limit 1", [sub]);
    await deliver(other, [id]);
    await q(db, other.owner, "insert into public.delivery_problems (org_id, delivery_id, kind, from_parent) values ($1, $2, 'late', true)", [other.org, id]);
    await q(db, other.owner, "update public.delivery_problems set from_parent = true where delivery_id = $1", [id]);
    const [p] = await q<{ from_parent: boolean }>(db, other.owner, "select from_parent from public.delivery_problems where delivery_id = $1", [id]);
    expect(p.from_parent).toBe(false);
  });
});
