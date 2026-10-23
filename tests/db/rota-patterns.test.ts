import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, seedKennel, type Kennel } from "./fixtures";
import { createTestDb, errorOf } from "./harness";
import { dayFromToday, q } from "./kitchen-fixtures";

/**
 * Roadmap M60: a rota that repeats, and forgotten clock-outs. A person's
 * usual week fills the rota four weeks ahead, week after week, minus their
 * leave; a day changed by hand stays changed. A stretch still open well after
 * its shift ended is found, and closed at the end of the shift with a note.
 */

let db: PGlite;
let k: Kennel;
let staff: string;
let staff2: string;
let manager: string;
let shifts: Record<"morning" | "evening" | "long", string>;
let today: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db);
  staff = await addMember(db, k, "staff");
  staff2 = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  const shift = async (name: string, from: string, to: string) =>
    (await q<{ id: string }>(db, manager, "insert into public.shifts (org_id, name, starts_at, ends_at) values ($1, $2, $3, $4) returning id", [k.org, name, from, to]))[0].id;
  shifts = { morning: await shift("Morning", "07:00", "15:00"), evening: await shift("Evening", "15:00", "23:00"), long: await shift("Long day", "12:00", "20:00") };
  today = await dayFromToday(db, k, 0);
});
afterAll(() => db.close());

const pattern = (actor: string, person: string, shift: string, weekdays: number[]) =>
  Promise.all(weekdays.map((d) => q<{ id: string }>(db, actor, "insert into public.rota_patterns (org_id, user_id, shift_id, weekday) values ($1, $2, $3, $4) returning id", [k.org, person, shift, d])));
const fill = (actor: string, until: string | null = null) => q<{ n: number }>(db, actor, "select public.fill_rota($1, $2) as n", [k.org, until]).then((r) => r[0].n);
const days = async (person: string, shift: string) =>
  (await q<{ d: string }>(db, manager, "select work_date::text as d from public.rota where user_id = $1 and shift_id = $2 order by work_date", [person, shift])).map((r) => r.d);

describe("a rota that repeats (M60)", () => {
  it("fills the next four weeks from a pattern, minus a day of leave", async () => {
    const leaveDay = await dayFromToday(db, k, 10);
    await q(db, manager, "insert into public.leave_requests (org_id, user_id, starts_on, ends_on, status) values ($1, $2, $3, $3, 'granted')", [k.org, staff, leaveDay]);
    await pattern(manager, staff, shifts.morning, [1, 2, 3, 4, 5, 6, 7]);
    expect(await fill(manager)).toBe(27);
    const filled = await days(staff, shifts.morning);
    const expected = [];
    for (let i = 0; i < 28; i++) if (i !== 10) expected.push(await dayFromToday(db, k, i));
    expect(filled).toEqual(expected);
    // Filling again makes nothing twice.
    expect(await fill(manager)).toBe(0);
  });

  it("keeps a day taken off by hand off, and fills on as the weeks go by", async () => {
    const off = await dayFromToday(db, k, 5);
    await q(db, manager, "delete from public.rota where user_id = $1 and work_date = $2", [staff, off]);
    expect(await fill(manager, await dayFromToday(db, k, 34))).toBe(7);
    const filled = await days(staff, shifts.morning);
    expect(filled).not.toContain(off);
    expect(filled).toContain(await dayFromToday(db, k, 34));
    expect(filled).toHaveLength(27 - 1 + 7);
  });

  it("skips a day the person is already on a shift at that time, and only on its weekday", async () => {
    const busy = await dayFromToday(db, k, 3);
    await q(db, manager, "insert into public.rota (org_id, shift_id, user_id, work_date) values ($1, $2, $3, $4)", [k.org, shifts.long, staff2, busy]);
    const [{ dow }] = await q<{ dow: number }>(db, manager, "select extract(isodow from $1::date)::int as dow", [busy]);
    await pattern(manager, staff2, shifts.morning, [dow]);
    await pattern(manager, staff2, shifts.evening, [dow === 7 ? 1 : dow + 1]);
    await fill(manager);
    const mornings = await days(staff2, shifts.morning);
    expect(mornings).not.toContain(busy);
    expect(mornings).toEqual([await dayFromToday(db, k, 10), await dayFromToday(db, k, 17), await dayFromToday(db, k, 24)]);
    expect(await days(staff2, shifts.evening)).toHaveLength(4);
  });

  it("takes a pattern's days still to come with it, and keeps today's", async () => {
    const [{ id }] = await q<{ id: string }>(db, manager, "select id from public.rota_patterns where user_id = $1 and shift_id = $2 order by weekday limit 1", [staff2, shifts.evening]);
    await q(db, manager, "delete from public.rota_patterns where id = $1", [id]);
    expect(await days(staff2, shifts.evening)).toEqual([]);
    const [{ id: monday }] = await q<{ id: string }>(db, manager, "select id from public.rota_patterns where user_id = $1 and weekday = extract(isodow from $2::date)", [staff, today]);
    await q(db, manager, "delete from public.rota_patterns where id = $1", [monday]);
    const left = await days(staff, shifts.morning);
    expect(left).toContain(today);
    expect(left).not.toContain(await dayFromToday(db, k, 7));
  });

  it("is planned by owners and managers, and never changed in place", async () => {
    const e = await errorOf(() => pattern(staff, staff, shifts.long, [1]));
    expect(e.message).toMatch(/row-level security/);
    const [{ id }] = await q<{ id: string }>(db, manager, "select id from public.rota_patterns where user_id = $1 limit 1", [staff]);
    expect((await errorOf(() => q(db, manager, "update public.rota_patterns set weekday = 1 + (weekday % 7) where id = $1", [id]))).message).toContain("WB275");
    const [{ n }] = await q<{ n: number }>(db, staff, "select count(*)::int as n from public.rota_patterns");
    expect(n).toBeGreaterThan(0);
  });
});

describe("forgotten clock-outs (M60)", () => {
  it("finds a stretch still open two hours after its shift ended, and closes it at the end of the shift", async () => {
    const yesterday = await dayFromToday(db, k, -1);
    await q(db, manager, "delete from public.rota where user_id = $1 and work_date = $2", [staff2, yesterday]);
    await q(db, manager, "insert into public.rota (org_id, shift_id, user_id, work_date) values ($1, $2, $3, $4)", [k.org, shifts.morning, staff2, yesterday]);
    // Clocked in yesterday at 06:50, ten minutes early, and never out.
    const [{ id }] = await q<{ id: string }>(
      db, manager,
      "insert into public.attendance (org_id, user_id, clocked_in_at, note) values ($1, $2, ($3::date + time '06:50') at time zone 'Asia/Kolkata', 'Phone was flat') returning id",
      [k.org, staff2, yesterday],
    );
    const found = await q<{ attendance_id: string; shift_name: string; shift_ended_at: string }>(db, manager, "select attendance_id, shift_name, shift_ended_at::text from public.forgotten_clock_outs($1)", [k.org]);
    expect(found.map((f) => [f.attendance_id, f.shift_name])).toEqual([[id, "Morning"]]);
    const [{ end }] = await q<{ end: string }>(db, manager, "select (($1::date + time '15:00') at time zone 'Asia/Kolkata')::text as end", [yesterday]);
    expect(new Date(found[0].shift_ended_at).toISOString()).toBe(new Date(end).toISOString());

    // A person sees only their own; another's is not theirs to close.
    expect(await q(db, staff, "select * from public.forgotten_clock_outs($1)", [k.org])).toEqual([]);
    const closedByStaff = await q(db, staff, "update public.attendance set clocked_out_at = $2, note = 'x' where id = $1 returning id", [id, found[0].shift_ended_at]).catch(() => []);
    expect(closedByStaff).toEqual([]);
    // Not yet, with a long wait after the shift.
    expect(await q(db, manager, "select * from public.forgotten_clock_outs($1, 100000)", [k.org])).toEqual([]);

    await q(db, manager, "update public.attendance set clocked_out_at = $2, note = 'Did not clock out: set to the end of the shift' where id = $1", [id, found[0].shift_ended_at]);
    expect(await q(db, manager, "select * from public.forgotten_clock_outs($1)", [k.org])).toEqual([]);
  });

  it("leaves alone a stretch with no shift to end it", async () => {
    await q(db, manager, "insert into public.attendance (org_id, user_id, clocked_in_at, note) values ($1, $2, now() - interval '30 hours', 'Came in for a delivery')", [k.org, manager]);
    expect(await q(db, manager, "select * from public.forgotten_clock_outs($1)", [k.org])).toEqual([]);
  });
});
