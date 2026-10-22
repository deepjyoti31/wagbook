import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book, seedKennel, type Kennel } from "./fixtures";
import { createTestDb, errorOf } from "./harness";
import { dayFromToday, q } from "./kitchen-fixtures";

/**
 * Roadmap M44: kennels go in and out of service by date, and a past day is
 * measured against the kennels that were there on that day.
 */

let db: PGlite;
let k: Kennel;
let manager: string;
let staff: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 3 });
  manager = await addMember(db, k, "manager");
  staff = await addMember(db, k, "staff");
});
afterAll(() => db.close());

const inService = async (day: string) =>
  (await q<{ n: number }>(db, staff, "select public.kennels_in_service($1, $2) as n", [k.org, day]))[0].n;
const history = (kennel: string) =>
  q<{ from_date: string; in_service: boolean }>(db, staff, "select from_date::text, in_service from public.kennel_service where kennel_id = $1 order by from_date", [kennel]);

describe("kennels in and out of service (M44)", () => {
  it("count from the day they were added, not before", async () => {
    const today = await dayFromToday(db, k, 0);
    expect(await history(k.kennels[0])).toEqual([{ from_date: today, in_service: true }]);
    expect(await inService(today)).toBe(3);
    expect(await inService(await dayFromToday(db, k, -1))).toBe(0);
  });

  it("can be added as in service since an earlier day", async () => {
    const since = await dayFromToday(db, k, -90);
    await q(db, manager, "update public.kennels set service_from = $2 where id = any($1)", [k.kennels, since]);
    expect(await inService(await dayFromToday(db, k, -60))).toBe(3);
    expect(await inService(await dayFromToday(db, k, -91))).toBe(0);
  });

  it("go out of service from a day, and past days still count them before it", async () => {
    const out = await dayFromToday(db, k, -10);
    await q(db, manager, "update public.kennels set is_active = false, service_from = $2 where id = $1", [k.kennels[2], out]);
    expect(await inService(await dayFromToday(db, k, -11))).toBe(3);
    expect(await inService(out)).toBe(2);
    expect(await inService(await dayFromToday(db, k, 5))).toBe(2);
    // Back in today, with no day given.
    await q(db, manager, "update public.kennels set is_active = true where id = $1", [k.kennels[2]]);
    expect(await inService(await dayFromToday(db, k, -1))).toBe(2);
    expect(await inService(await dayFromToday(db, k, 0))).toBe(3);
  });

  it("go out and back on one day as one change", async () => {
    await q(db, manager, "update public.kennels set is_active = false where id = $1", [k.kennels[2]]);
    await q(db, manager, "update public.kennels set is_active = true where id = $1", [k.kennels[2]]);
    const rows = await history(k.kennels[2]);
    expect(rows.at(-1)).toEqual({ from_date: await dayFromToday(db, k, 0), in_service: true });
    expect(rows).toHaveLength(3);
  });

  it("are never dated after today, or before their last change (WB230, WB231)", async () => {
    const later = await errorOf(() => q(db, manager, "update public.kennels set is_active = false, service_from = $2 where id = $1", [k.kennels[1], "2099-01-01"]));
    expect(later.message).toContain("WB230");
    const twoDaysAgo = await dayFromToday(db, k, -2);
    const before = await errorOf(() => q(db, manager, "update public.kennels set is_active = false, service_from = $2 where id = $1", [k.kennels[2], twoDaysAgo]));
    expect(before.message).toContain("WB231");
    const added = await errorOf(() => q(db, manager, "insert into public.kennels (org_id, name, service_from) values ($1, 'Later', '2099-01-01')", [k.org]));
    expect(added.message).toContain("WB230");
  });

  it("are changed by owners and managers; nobody writes the history by hand", async () => {
    expect(await q(db, staff, "update public.kennels set is_active = false where id = $1 returning id", [k.kennels[0]])).toEqual([]);
    const e = await errorOf(() => q(db, manager, "insert into public.kennel_service (org_id, kennel_id, from_date, in_service) values ($1, $2, '2020-01-01', true)", [k.org, k.kennels[0]]));
    expect(e.code).toBe("42501");
    const u = await errorOf(() => q(db, k.owner, "update public.kennel_service set in_service = false where kennel_id = $1", [k.kennels[0]]));
    expect(u.code).toBe("42501");
  });

  it("measure the occupancy report and the calendar against the kennels there that day", async () => {
    const day = await dayFromToday(db, k, -20);
    await book(db, k, { pet: k.pets[0], start: day, end: await dayFromToday(db, k, -18), kennel: k.kennels[0], status: "checked_out" });
    await q(db, manager, "update public.kennels set is_active = false, service_from = $2 where id = $1", [k.kennels[1], await dayFromToday(db, k, -19)]);
    const report = await q<{ day: string; capacity: number }>(db, manager, "select day::text, capacity from public.report_occupancy($1, $2, $3)", [k.org, day, await dayFromToday(db, k, -18)]);
    expect(report.map((r) => r.capacity)).toEqual([3, 2, 2]);
    const calendar = await q<{ capacity: number }>(db, staff, "select capacity from public.occupancy_by_day($1, $2, $3)", [k.org, day, await dayFromToday(db, k, -18)]);
    expect(calendar.map((r) => r.capacity)).toEqual([3, 2, 2]);
  });
});
