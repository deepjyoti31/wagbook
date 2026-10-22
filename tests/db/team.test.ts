import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, seedKennel, type Kennel } from "./fixtures";
import { admin, as, createTestDb, createUser, errorOf, user } from "./harness";
import { dayFromToday, q } from "./kitchen-fixtures";

/**
 * Roadmap M43: shifts and the rota, leave asked for and answered, and
 * clocking in and out, with each person's attendance their own.
 */

let db: PGlite;
let k: Kennel;
let staff: string;
let staff2: string;
let manager: string;
let rider: string;
let shifts: Record<"morning" | "evening" | "night" | "long", string>;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db);
  staff = await addMember(db, k, "staff");
  staff2 = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  rider = await addMember(db, k, "rider");
  const shift = async (name: string, from: string, to: string) =>
    (await q<{ id: string }>(db, manager, "insert into public.shifts (org_id, name, starts_at, ends_at) values ($1, $2, $3, $4) returning id", [k.org, name, from, to]))[0].id;
  shifts = {
    morning: await shift("Morning", "07:00", "15:00"),
    evening: await shift("Evening", "15:00", "23:00"),
    night: await shift("Night", "23:00", "07:00"),
    long: await shift("Long day", "12:00", "20:00"),
  };
});
afterAll(() => db.close());

const onRota = (actor: string, shift: string, person: string, day: string) =>
  q<{ id: string; starts_at: string; ends_at: string }>(
    db, actor,
    "insert into public.rota (org_id, shift_id, user_id, work_date) values ($1, $2, $3, $4) returning id, starts_at::text, ends_at::text",
    [k.org, shift, person, day],
  );

const askLeave = (actor: string, person: string, from: string, to: string, status = "asked") =>
  q<{ id: string; status: string }>(
    db, actor,
    "insert into public.leave_requests (org_id, user_id, starts_on, ends_on, reason, status) values ($1, $2, $3, $4, 'Family wedding', $5) returning id, status",
    [k.org, person, from, to, status],
  );

describe("the rota (M43)", () => {
  it("puts a person on one shift at a time; a night shift ends the next morning", async () => {
    const d = await dayFromToday(db, k, 5);
    const d2 = await dayFromToday(db, k, 6);
    await onRota(manager, shifts.morning, staff, d);
    await onRota(manager, shifts.evening, staff, d);
    const [night] = await onRota(manager, shifts.night, staff, d);
    expect([night.starts_at, night.ends_at]).toEqual([`${d} 23:00:00`, `${d2} 07:00:00`]);
    // The morning after the night starts as the night ends.
    await onRota(manager, shifts.morning, staff, d2);
    const twice = await errorOf(() => onRota(manager, shifts.long, staff, d));
    expect(twice.message).toContain("rota_one_shift_at_a_time");
  });

  it("is planned by owners and managers, and read by everyone", async () => {
    const d = await dayFromToday(db, k, 8);
    const e = await errorOf(() => onRota(staff, shifts.morning, staff2, d));
    expect(e.code).toBe("42501");
    const [row] = await onRota(manager, shifts.morning, staff2, d);
    const seen = await q<{ id: string }>(db, staff, "select id from public.rota where org_id = $1 and work_date = $2", [k.org, d]);
    expect(seen.map((r) => r.id)).toEqual([row.id]);
    // Taking someone off a shift is part of planning (D48).
    expect(await q(db, manager, "delete from public.rota where id = $1 returning id", [row.id])).toHaveLength(1);
    expect(await q(db, staff, "delete from public.rota where org_id = $1 returning id", [k.org])).toEqual([]);
  });

  it("never takes a shift off the list, a rider or someone suspended (WB220, WB221)", async () => {
    const d = await dayFromToday(db, k, 9);
    const r = await errorOf(() => onRota(manager, shifts.morning, rider, d));
    expect(r.message).toContain("WB221");
    await q(db, manager, "update public.shifts set is_active = false where id = $1", [shifts.long]);
    const off = await errorOf(() => onRota(manager, shifts.long, staff2, d));
    expect(off.message).toContain("WB220");
    await q(db, manager, "update public.shifts set is_active = true where id = $1", [shifts.long]);
    const gone = await addMember(db, k, "staff");
    await q(db, manager, "update public.memberships set is_active = false where org_id = $1 and user_id = $2", [k.org, gone]);
    const s = await errorOf(() => onRota(manager, shifts.morning, gone, d));
    expect(s.message).toContain("WB221");
  });

  it("moves its rows to a shift's new hours from today on", async () => {
    const past = await dayFromToday(db, k, -3);
    const future = await dayFromToday(db, k, 12);
    const [{ id: early }] = await q<{ id: string }>(db, manager, "insert into public.shifts (org_id, name, starts_at, ends_at) values ($1, 'Early', '06:00', '10:00') returning id", [k.org]);
    await onRota(manager, early, staff2, past);
    await onRota(manager, early, staff2, future);
    await q(db, manager, "update public.shifts set starts_at = '05:00', ends_at = '09:00' where id = $1", [early]);
    const rows = await q<{ work_date: string; starts_at: string }>(db, staff, "select work_date::text, starts_at::text from public.rota where shift_id = $1 order by work_date", [early]);
    expect(rows).toEqual([
      { work_date: past, starts_at: `${past} 06:00:00` },
      { work_date: future, starts_at: `${future} 05:00:00` },
    ]);
  });
});

describe("leave (M43)", () => {
  it("is asked for by the person and answered by an owner or manager, never their own (WB223, WB224)", async () => {
    const [mine] = await askLeave(staff, staff, await dayFromToday(db, k, 20), await dayFromToday(db, k, 22));
    expect(mine.status).toBe("asked");
    const self = await errorOf(() => q(db, staff, "update public.leave_requests set status = 'granted' where id = $1", [mine.id]));
    expect(self.message).toContain("WB223");
    const day40 = await dayFromToday(db, k, 40);
    const straight = await errorOf(() => askLeave(staff, staff, day40, day40, "granted"));
    expect(straight.message).toContain("WB223");
    const [own] = await askLeave(manager, manager, await dayFromToday(db, k, 20), await dayFromToday(db, k, 21));
    const managersOwn = await errorOf(() => q(db, manager, "update public.leave_requests set status = 'granted' where id = $1", [own.id]));
    expect(managersOwn.message).toContain("WB224");
    const [granted] = await q<{ status: string; decided_by: string }>(db, k.owner, "update public.leave_requests set status = 'granted' where id = $1 returning status, decided_by", [own.id]);
    expect(granted).toEqual({ status: "granted", decided_by: k.owner });
    // An owner answers their own.
    const [ownersOwn] = await askLeave(k.owner, k.owner, await dayFromToday(db, k, 50), await dayFromToday(db, k, 51), "granted");
    expect(ownersOwn.status).toBe("granted");
    await q(db, manager, "update public.leave_requests set status = 'refused', answer = 'Short of hands that week' where id = $1", [mine.id]);
  });

  it("takes the person off the rota on granted days, and the rota then refuses them (WB222)", async () => {
    const d = await dayFromToday(db, k, 30);
    await onRota(manager, shifts.morning, staff2, d);
    const [l] = await askLeave(staff2, staff2, d, await dayFromToday(db, k, 31));
    expect(await q(db, manager, "select id from public.rota where user_id = $1 and work_date = $2", [staff2, d])).toHaveLength(1);
    await q(db, manager, "update public.leave_requests set status = 'granted' where id = $1", [l.id]);
    expect(await q(db, manager, "select id from public.rota where user_id = $1 and work_date = $2", [staff2, d])).toEqual([]);
    const e = await errorOf(() => onRota(manager, shifts.evening, staff2, d));
    expect(e.message).toContain("WB222");
  });

  it("is final once refused or withdrawn, keeps granted days, and never overlaps (WB225)", async () => {
    const from = await dayFromToday(db, k, 60);
    const to = await dayFromToday(db, k, 62);
    const [l] = await askLeave(staff, staff, from, to);
    const overlap = await errorOf(() => askLeave(staff, staff, to, to));
    expect(overlap.message).toContain("leave_requests_one_at_a_time");
    await q(db, manager, "update public.leave_requests set status = 'granted' where id = $1", [l.id]);
    const longer = await errorOf(() => q(db, staff, "update public.leave_requests set ends_on = ends_on + 1 where id = $1", [l.id]));
    expect(longer.message).toContain("WB225");
    // The person takes it back.
    await q(db, staff, "update public.leave_requests set status = 'withdrawn' where id = $1", [l.id]);
    const again = await errorOf(() => q(db, manager, "update public.leave_requests set status = 'granted' where id = $1", [l.id]));
    expect(again.message).toContain("WB225");
    // Withdrawn leave holds no days: they may be asked for again.
    await askLeave(staff, staff, from, to);
  });

  it("is seen by the person and by owners and managers, nobody else", async () => {
    const theirs = await q<{ user_id: string }>(db, staff2, "select user_id from public.leave_requests where org_id = $1", [k.org]);
    expect(new Set(theirs.map((r) => r.user_id))).toEqual(new Set([staff2]));
    const all = await q<{ user_id: string }>(db, manager, "select distinct user_id from public.leave_requests where org_id = $1", [k.org]);
    expect(all.length).toBeGreaterThan(2);
    const forOther = await errorOf(() => askLeave(staff, staff2, "2027-12-01", "2027-12-02"));
    expect(forOther.code).toBe("42501");
  });
});

describe("attendance (M43)", () => {
  const clockIn = (actor: string, person = actor, at: string | null = null, note: string | null = null) =>
    q<{ id: string; clocked_in_at: string; work_date: string }>(
      db, actor,
      `insert into public.attendance (org_id, user_id, clocked_in_at, note) values ($1, $2, coalesce($3::timestamptz, now()), $4)
       returning id, clocked_in_at::text, work_date::text`,
      [k.org, person, at, note],
    );
  const secondsAgo = async (iso: string) => {
    const [{ s }] = await q<{ s: number }>(db, k.owner, "select extract(epoch from now() - $1::timestamptz)::int as s", [iso]);
    return s;
  };

  it("stamps clocking in and out with the database's time, on the kennel's day", async () => {
    const [row] = await clockIn(staff, staff, "2020-01-01T09:00:00Z");
    expect(Math.abs(await secondsAgo(row.clocked_in_at))).toBeLessThan(60);
    expect(row.work_date).toBe(await dayFromToday(db, k, 0));
    const [out] = await q<{ clocked_out_at: string }>(db, staff, "update public.attendance set clocked_out_at = '2030-01-01' where id = $1 returning clocked_out_at::text", [row.id]);
    expect(Math.abs(await secondsAgo(out.clocked_out_at))).toBeLessThan(60);
  });

  it("keeps one stretch open at a time", async () => {
    await clockIn(staff2);
    const twice = await errorOf(() => clockIn(staff2));
    expect(twice.message).toContain("attendance_one_at_a_time");
  });

  it("leaves times by hand to owners and managers, with a note, never later than now (WB226 to WB228)", async () => {
    const [{ id }] = await q<{ id: string }>(db, staff, "select id from public.attendance where user_id = $1", [staff]);
    const moved = await errorOf(() => q(db, staff, "update public.attendance set clocked_in_at = clocked_in_at - interval '1 hour' where id = $1", [id]));
    expect(moved.message).toContain("WB226");
    const ownByHand = await errorOf(() => clockIn(staff, staff, "2026-01-05T03:00:00Z", "Forgot"));
    expect(ownByHand.message).toContain("WB226");
    const noNote = await errorOf(() => clockIn(manager, staff, "2026-01-05T03:00:00Z"));
    expect(noNote.message).toContain("WB227");
    const later = await errorOf(() => clockIn(manager, staff, "2099-01-05T03:00:00Z", "Night cover"));
    expect(later.message).toContain("WB228");
    const [byHand] = await q<{ work_date: string; created_by: string }>(
      db, manager,
      `insert into public.attendance (org_id, user_id, clocked_in_at, clocked_out_at, note)
       values ($1, $2, '2026-01-04T17:30:00Z', '2026-01-05T01:30:00Z', 'Phone was dead') returning work_date::text, created_by`,
      [k.org, staff],
    );
    // 23:00 in Bengaluru on the 4th: it counts on the 4th.
    expect(byHand).toEqual({ work_date: "2026-01-04", created_by: manager });
    const changed = await q(db, manager, "update public.attendance set clocked_in_at = clocked_in_at - interval '15 minutes', note = 'Came early' where id = $1 returning id", [id]);
    expect(changed).toHaveLength(1);
    const audit = await q<{ n: number }>(db, k.owner, "select count(*)::int as n from public.audit_log where table_name = 'attendance' and row_id = $1", [id]);
    expect(audit[0].n).toBeGreaterThan(0);
  });

  it("is seen by its person and by owners and managers; who is on now is told to everyone, names only", async () => {
    const seen = await q<{ user_id: string }>(db, staff, "select user_id from public.attendance where org_id = $1", [k.org]);
    expect(new Set(seen.map((r) => r.user_id))).toEqual(new Set([staff]));
    const all = await q<{ user_id: string }>(db, manager, "select distinct user_id from public.attendance where org_id = $1", [k.org]);
    expect(new Set(all.map((r) => r.user_id))).toEqual(new Set([staff, staff2]));
    const on = await q<{ user_id: string; display_name: string }>(db, staff, "select * from public.who_is_on($1)", [k.org]);
    expect(on.map((r) => r.user_id)).toEqual([staff2]);
    const other = await seedKennel(db);
    expect(await q(db, other.owner, "select * from public.who_is_on($1)", [k.org])).toEqual([]);
    const stranger = await createUser(db, "nosy@example.test");
    expect(await q(db, stranger, "select * from public.who_is_on($1)", [k.org])).toEqual([]);
    expect(await q(db, rider, "select * from public.who_is_on($1)", [k.org])).toEqual([]);
    const stolen = await errorOf(() => clockIn(staff, staff2));
    expect(stolen.code).toBe("42501");
  });

  it("is not for riders or people suspended (WB221)", async () => {
    const r = await errorOf(() => clockIn(rider));
    expect(r.message).toContain("WB221");
    const gone = await addMember(db, k, "staff");
    await q(db, manager, "update public.memberships set is_active = false where org_id = $1 and user_id = $2", [k.org, gone]);
    const g = await errorOf(() => clockIn(manager, gone, "2026-02-01T03:00:00Z", "Last day"));
    expect(g.message).toContain("WB221");
  });

  it("is kept for pay: a person with some is suspended, not removed; deleting the kennel takes it all", async () => {
    const e = await errorOf(() => q(db, k.owner, "delete from public.memberships where org_id = $1 and user_id = $2", [k.org, staff]));
    expect(e.message).toContain("attendance_keeps_member");
    const leaving = await errorOf(() => q(db, staff, "delete from public.memberships where org_id = $1 and user_id = $2", [k.org, staff]));
    expect(leaving.message).toContain("attendance_keeps_member");
    // Someone with no attendance is still removed, with their rota and leave.
    expect(await q(db, k.owner, "delete from public.memberships where org_id = $1 and user_id = $2 returning user_id", [k.org, rider])).toHaveLength(1);
    await q(db, k.owner, "delete from public.organizations where id = $1", [k.org]);
    const left = await as(db, admin, async () => (await db.query<{ n: number }>("select count(*)::int as n from public.attendance where org_id = $1", [k.org])).rows[0].n);
    expect(left).toBe(0);
  });
});

describe("living on site (M43)", () => {
  it("is set by owners and managers, not by staff", async () => {
    const k2 = await seedKennel(db);
    const s = await addMember(db, k2, "staff");
    const m = await addMember(db, k2, "manager");
    expect(await q(db, s, "update public.memberships set lives_on_site = true where org_id = $1 and user_id = $2 returning user_id", [k2.org, s])).toEqual([]);
    expect(await q(db, m, "update public.memberships set lives_on_site = true where org_id = $1 and user_id = $2 returning user_id", [k2.org, s])).toHaveLength(1);
    await as(db, user(s), async () => {
      const r = await db.query<{ lives_on_site: boolean }>("select lives_on_site from public.memberships where org_id = $1 and user_id = $2", [k2.org, s]);
      expect(r.rows[0].lives_on_site).toBe(true);
    });
  });
});
