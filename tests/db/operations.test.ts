import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, seedKennel, type Kennel } from "./fixtures";
import { admin, as, createTestDb, errorOf } from "./harness";
import { dayFromToday, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Phase 5 (M46 to M49): overnight jobs, problems on the server, importing a
 * spreadsheet, and the photo archive.
 */

let db: PGlite;
let k: Kitchen;
let other: Kennel;
let staff: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKitchen(db);
  other = await seedKennel(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
});
afterAll(() => db.close());

const asAdmin = <T>(sql: string, params: unknown[] = []) => as(db, admin, async () => (await db.query<T>(sql, params)).rows);
const execAdmin = (sql: string) => as(db, admin, () => db.exec(sql));
const fails = (actor: string, sql: string, params: unknown[] = []) => errorOf(() => q(db, actor, sql, params));

describe("overnight jobs (M46)", () => {
  it("makes a subscription's deliveries ahead, and a second run makes none", async () => {
    const [{ id: sub }] = await q<{ id: string }>(
      db, k.owner,
      "insert into public.subscriptions (org_id, client_id, pet_id, product_id, grams_per_day, weekdays, starts_on) values ($1, $2, $3, $4, 300, '{1,2,3,4,5,6,7}', $5) returning id",
      [k.org, k.client, k.pets[0], k.subscriptionFood, await dayFromToday(db, k, 0)],
    );
    const count = async () => (await asAdmin<{ n: number }>("select count(*)::int as n from public.deliveries where subscription_id = $1", [sub]))[0].n;
    expect(await count()).toBe(0);

    await asAdmin("select public.run_nightly_jobs()");
    const first = await count();
    // Every day from today for 21 days ahead.
    expect(first).toBe(22);
    const [run] = await asAdmin<{ ok: boolean; made: number }>(
      "select ok, made from public.job_runs where org_id = $1 and job = 'plan_deliveries' order by ran_at desc limit 1", [k.org]);
    expect(run).toEqual({ ok: true, made: 22 });

    await asAdmin("select public.run_nightly_jobs()");
    expect(await count()).toBe(first);
    const runs = await asAdmin<{ made: number }>(
      "select made from public.job_runs where org_id = $1 and job = 'plan_deliveries' order by ran_at, made desc", [k.org]);
    expect(runs.map((r) => r.made)).toEqual([22, 0]);
  });

  it("writes down a job that fails, and still runs the others and the other kennels", async () => {
    await execAdmin(`
      create function public.test_refuse_deliveries() returns trigger language plpgsql set search_path = '' as $$
      begin raise exception 'the kitchen is closed'; end; $$;
      create trigger test_refuse_deliveries before insert on public.deliveries for each row execute function public.test_refuse_deliveries();`);
    try {
      await asAdmin("update public.subscriptions set weekdays = '{1,2,3,4,5,6,7}' where org_id = $1", [k.org]);
      await asAdmin("delete from public.deliveries where org_id = $1 and delivery_date > public.org_today($1) + 10", [k.org]);
      await asAdmin("select public.run_nightly_jobs()");
      const runs = await asAdmin<{ org_id: string; job: string; ok: boolean; problem: string | null }>(
        "select distinct on (org_id, job) org_id, job, ok, problem from public.job_runs order by org_id, job, ran_at desc");
      const mine = runs.filter((r) => r.org_id === k.org);
      expect(mine.find((r) => r.job === "plan_deliveries")).toMatchObject({ ok: false, problem: "the kitchen is closed" });
      expect(mine.find((r) => r.job === "forget_old_rows")).toMatchObject({ ok: true, problem: null });
      expect(runs.filter((r) => r.org_id === other.org).every((r) => r.ok)).toBe(true);
    } finally {
      await execAdmin("drop trigger test_refuse_deliveries on public.deliveries; drop function public.test_refuse_deliveries();");
    }
  });

  it("forgets problems older than 90 days", async () => {
    await asAdmin(
      "insert into public.app_errors (org_id, happened_at, path, kind, message) values ($1, now() - interval '91 days', '/app', 'render', 'old'), ($1, now() - interval '89 days', '/app', 'render', 'recent')",
      [k.org]);
    await asAdmin("select public.job_forget_old_rows($1)", [k.org]);
    const left = await asAdmin<{ message: string }>("select message from public.app_errors where org_id = $1 and message in ('old', 'recent')", [k.org]);
    expect(left.map((r) => r.message)).toEqual(["recent"]);
  });

  it("is not something the app can run, and only owners and managers read the runs", async () => {
    expect((await fails(k.owner, "select public.run_nightly_jobs()")).code).toBe("42501");
    expect((await fails(k.owner, "select public.job_plan_deliveries($1)", [k.org])).code).toBe("42501");
    expect((await q(db, manager, "select 1 from public.job_runs where org_id = $1", [k.org])).length).toBeGreaterThan(0);
    expect(await q(db, staff, "select 1 from public.job_runs where org_id = $1", [k.org])).toEqual([]);
    expect(await q(db, other.owner, "select 1 from public.job_runs where org_id = $1", [k.org])).toEqual([]);
  });
});

describe("problems on the server (M48)", () => {
  it("are written without email addresses or phone numbers, for the kennel the person works in", async () => {
    await q(db, staff, "select public.log_app_error($2, 'action', $3, $1, 'abc123')", [
      k.org,
      "/app/bookings/new?pet=1",
      "Could not book for asha@example.in on +91 98765 43210 (row 4) from 2026-10-22",
    ]);
    const [row] = await q<{ path: string; kind: string; message: string; digest: string }>(
      db, k.owner, "select path, kind, message, digest from public.app_errors where org_id = $1 and digest = 'abc123'", [k.org]);
    expect(row).toEqual({ path: "/app/bookings/new", kind: "action", message: "Could not book for [email] on [number] (row 4) from 2026-10-22", digest: "abc123" });
  });

  it("go to the person's own kennel when the one named is not theirs", async () => {
    await q(db, staff, "select public.log_app_error('/app', 'render', 'elsewhere', $1, 'other1')", [other.org]);
    expect(await q(db, other.owner, "select 1 from public.app_errors where digest = 'other1'")).toEqual([]);
    expect((await q(db, k.owner, "select 1 from public.app_errors where digest = 'other1'")).length).toBe(1);
  });

  it("are read by owners only, and written by nobody directly", async () => {
    expect(await q(db, manager, "select 1 from public.app_errors where org_id = $1", [k.org])).toEqual([]);
    expect(await q(db, staff, "select 1 from public.app_errors where org_id = $1", [k.org])).toEqual([]);
    expect((await fails(k.owner, "insert into public.app_errors (org_id, path, kind, message) values ($1, '/', 'render', 'x')", [k.org])).code).toBe("42501");
  });

  it("stop at 200 an hour for a kennel", async () => {
    for (let i = 0; i < 210; i++) await q(db, staff, "select public.log_app_error('/app', 'render', 'again and again', $1)", [k.org]);
    const [{ n }] = await asAdmin<{ n: number }>("select count(*)::int as n from public.app_errors where org_id = $1 and happened_at > now() - interval '1 hour'", [k.org]);
    expect(n).toBe(200);
  });
});

describe("importing a spreadsheet (M47)", () => {
  const row = (phone: string, parent: string, pet: string, extra: Record<string, unknown> = {}) => ({
    parent: { name: parent, phone, email: null, address: "4 Lake Road", city: "Bengaluru", postal_code: "560038", area: "Indiranagar" },
    pet: { name: pet, species: "dog", breed: "Indie", sex: "female", is_neutered: true, date_of_birth: "2021-03-01", weight_g: 18000, ...extra },
    vaccinations: [{ vaccine: "Rabies", given_on: "2026-01-10", valid_until: "2027-01-10" }],
  });

  it("adds parents and pets, matches a known parent by phone, and skips a pet already known", async () => {
    const [{ known }] = await q<{ known: string }>(db, k.owner, "select phone as known from public.clients where id = $1", [k.client]);
    const [{ dog }] = await q<{ dog: string }>(db, k.owner, "select name as dog from public.pets where id = $1", [k.pets[0]]);
    const [{ result }] = await q<{ result: Record<string, number> }>(db, manager, "select public.import_parents_and_pets($1, $2) as result", [
      k.org,
      JSON.stringify([
        row("+919900011122", "Asha Rao", "Mithai"),
        row("+919900011122", "Asha Rao", "Laddoo"),
        row(known, "Someone else", "Bruno"),
        row(known, "Someone else", dog.toUpperCase()),
      ]),
    ]);
    expect(result).toEqual({ parents_added: 1, parents_matched: 1, pets_added: 3, pets_skipped: 1, vaccinations_added: 3 });

    const [asha] = await q<{ id: string; full_name: string; consent_source: string }>(db, staff, "select id, full_name, consent_source from public.clients where org_id = $1 and phone = '+919900011122'", [k.org]);
    expect(asha).toMatchObject({ full_name: "Asha Rao", consent_source: "staff" });
    const pets = await q<{ name: string; weight_g: number; vaccines: number }>(
      db, staff,
      "select p.name, p.weight_g, (select count(*)::int from public.vaccinations v where v.pet_id = p.id) as vaccines from public.pets p where p.client_id = $1 order by p.name",
      [asha.id]);
    expect(pets).toEqual([{ name: "Laddoo", weight_g: 18000, vaccines: 1 }, { name: "Mithai", weight_g: 18000, vaccines: 1 }]);
    expect((await q(db, staff, "select 1 from public.client_addresses where client_id = $1", [asha.id])).length).toBe(1);
    // The known parent's name was left as it was.
    expect((await q<{ full_name: string }>(db, staff, "select full_name from public.clients where id = $1", [k.client]))[0].full_name).not.toBe("Someone else");
  });

  it("writes all of it or none of it", async () => {
    const before = await q<{ n: number }>(db, k.owner, "select count(*)::int as n from public.clients where org_id = $1", [k.org]);
    const error = await fails(k.owner, "select public.import_parents_and_pets($1, $2)", [
      k.org,
      JSON.stringify([row("+919900022233", "Good row", "Fine"), row("not a phone", "Bad row", "Broken")]),
    ]);
    expect(error.code).toBe("23514");
    expect(await q<{ n: number }>(db, k.owner, "select count(*)::int as n from public.clients where org_id = $1", [k.org])).toEqual(before);
  });

  it("is for owners and managers, into their own kennel, at most 2000 rows at a time", async () => {
    expect((await fails(staff, "select public.import_parents_and_pets($1, '[]')", [k.org])).message).toMatch(/^WB002/);
    expect((await fails(k.owner, "select public.import_parents_and_pets($1, '[]')", [other.org])).message).toMatch(/^WB002/);
    const many = JSON.stringify(Array.from({ length: 2001 }, (_, i) => row(`+9199000${String(i).padStart(5, "0")}`, "P", "D")));
    expect((await fails(k.owner, "select public.import_parents_and_pets($1, $2)", [k.org, many])).message).toMatch(/^WB240/);
  });
});

describe("the photo archive (M49)", () => {
  let month: string;
  let update: string;

  beforeAll(async () => {
    // A stay with an update holding two photos, taken last month, and other files that are never archived.
    const [{ m }] = await asAdmin<{ m: string }>("select (date_trunc('month', public.org_today($1)) - interval '1 month')::date::text as m", [k.org]);
    month = m;
    const start = await dayFromToday(db, k, -40);
    const [{ id: booking }] = await q<{ id: string }>(
      db, k.owner,
      "insert into public.bookings (org_id, client_id, pet_id, kind, status, start_date, end_date, rate_minor) values ($1, $2, $3, 'boarding', 'confirmed', $4, $5, 100000) returning id",
      [k.org, k.client, k.pets[1], start, await dayFromToday(db, k, -38)]);
    update = (await q<{ id: string }>(db, k.owner, "insert into public.stay_updates (org_id, booking_id, pet_id, body) values ($1, $2, $3, 'Happy in the yard') returning id", [k.org, booking, k.pets[1]]))[0].id;
    const takenAt = `${month} 12:00:00+05:30`;
    const file = (name: string, size: number, at = takenAt) =>
      asAdmin("insert into storage.objects (bucket_id, name, created_at, metadata) values ('pet-media', $1, $2, $3)", [name, at, JSON.stringify({ size })]);
    await file(`${k.org}/updates/${update}/1.jpg`, 300000);
    await file(`${k.org}/updates/${update}/1.small.jpg`, 20000);
    await file(`${k.org}/updates/${update}/2.jpg`, 250000);
    await file(`${k.org}/updates/${update}/2.small.jpg`, 18000);
    await file(`${k.org}/pets/${k.pets[1]}/face.jpg`, 200000);
    await file(`${k.org}/vaccinations/abc.pdf`, 90000);
    await file(`${k.org}/expenses/receipt.jpg`, 80000);
    // This month's photo is not in last month's archive.
    await file(`${k.org}/updates/${update}/3.jpg`, 1000, new Date().toISOString());
    await file(`${other.org}/updates/x/1.jpg`, 999999);
  });

  it("shows owners and managers the space used by month, and staff nothing", async () => {
    const rows = await q<{ month: string; files: number; bytes: number; photos: number; photo_bytes: number }>(
      db, manager, "select month::text, files, bytes, photos, photo_bytes from public.photo_space($1) where month = $2", [k.org, month]);
    expect(rows).toEqual([{ month, files: 7, bytes: 958000, photos: 2, photo_bytes: 550000 }]);
    expect((await fails(staff, "select * from public.photo_space($1)", [k.org])).message).toMatch(/^WB002/);
  });

  it("lists a month's photos with the pet each shows, for a month that has ended only", async () => {
    const files = await q<{ path: string; pet_name: string; bytes: number }>(db, manager, "select path, pet_name, bytes from public.photo_month_files($1, $2)", [k.org, month]);
    const [{ name }] = await q<{ name: string }>(db, k.owner, "select name from public.pets where id = $1", [k.pets[1]]);
    expect(files).toEqual([
      { path: `${k.org}/updates/${update}/1.jpg`, pet_name: name, bytes: 300000 },
      { path: `${k.org}/updates/${update}/2.jpg`, pet_name: name, bytes: 250000 },
    ]);
    const [{ thisMonth }] = await asAdmin<{ thisMonth: string }>("select date_trunc('month', public.org_today($1))::date::text as \"thisMonth\"", [k.org]);
    expect((await fails(k.owner, "select * from public.photo_month_files($1, $2)", [k.org, thisMonth])).message).toMatch(/^WB241/);
    expect((await fails(staff, "select * from public.photo_month_files($1, $2)", [k.org, month])).message).toMatch(/^WB002/);
  });

  it("removes a month only after it was downloaded, by an owner, keeping the small copies", async () => {
    expect((await fails(k.owner, "select * from public.photos_to_remove($1, $2)", [k.org, month])).message).toMatch(/^WB243/);
    expect((await fails(k.owner, "select public.record_photo_removal($1, $2, 2, 550000)", [k.org, month])).message).toMatch(/^WB243/);

    await q(db, manager, "select public.record_photo_download($1, $2, 2, 550000)", [k.org, month]);
    expect((await fails(manager, "select * from public.photos_to_remove($1, $2)", [k.org, month])).message).toMatch(/^WB242/);
    expect((await fails(staff, "select * from public.photos_to_remove($1, $2)", [k.org, month])).message).toMatch(/^WB242/);

    const paths = (await q<{ p: string }>(db, k.owner, "select p from public.photos_to_remove($1, $2) p", [k.org, month])).map((r) => r.p);
    expect(paths).toHaveLength(2);
    // A manager cannot delete the files themselves either: storage deletes are for owners (D29).
    await q(db, manager, "delete from storage.objects where name = any ($1)", [paths]);
    expect((await asAdmin("select 1 from storage.objects where name = any ($1)", [paths])).length).toBe(2);
    await q(db, k.owner, "delete from storage.objects where name = any ($1)", [paths]);
    await q(db, k.owner, "select public.record_photo_removal($1, $2, 2, 550000)", [k.org, month]);

    const left = (await asAdmin<{ name: string }>("select name from storage.objects where name like $1 order by name", [`${k.org}/updates/${update}/%`])).map((r) => r.name);
    expect(left).toEqual([`${k.org}/updates/${update}/1.small.jpg`, `${k.org}/updates/${update}/2.small.jpg`, `${k.org}/updates/${update}/3.jpg`]);
    const [archive] = await q<{ downloaded: boolean; removed: boolean; files: number }>(
      db, manager, "select downloaded_at is not null as downloaded, removed_at is not null as removed, files from public.photo_archives where org_id = $1", [k.org]);
    expect(archive).toEqual({ downloaded: true, removed: true, files: 2 });
    expect(await q(db, staff, "select 1 from public.photo_archives where org_id = $1", [k.org])).toEqual([]);
  });
});
