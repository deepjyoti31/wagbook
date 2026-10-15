import { readFileSync } from "node:fs";
import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createTestDb, SEED_PATH, user } from "./harness";

let db: PGlite;

beforeAll(async () => {
  db = await createTestDb();
  await db.exec(readFileSync(SEED_PATH, "utf8"));
});
afterAll(() => db.close());

const OWNER = "d0000000-0000-4000-8000-000000000001";
const STAFF = "d0000000-0000-4000-8000-000000000003";

describe("the demo seed", () => {
  it("applies on top of every migration and builds one demo kennel with its team", async () => {
    const org = await db.query<{ id: string; name: string }>("select id, name from public.organizations where slug = 'demo'");
    expect(org.rows).toHaveLength(1);
    const team = await db.query<{ role: string }>("select m.role::text as role from public.memberships m where m.org_id = $1 and m.is_active order by m.role", [org.rows[0].id]);
    expect(team.rows.map((r) => r.role)).toEqual(["owner", "manager", "staff"]);
  });

  it("gives every demo account a password and an email identity, so they can sign in", async () => {
    const users = await db.query<{ ok: boolean }>(
      "select u.encrypted_password = extensions.crypt('wagbook-demo', u.encrypted_password) as ok from auth.users u join auth.identities i on i.user_id = u.id where u.email like '%@demo.wagbook.test'",
    );
    expect(users.rows).toHaveLength(3);
    expect(users.rows.every((r) => r.ok)).toBe(true);
  });

  it("has pets in house, arrivals today, an overstay, a family, a request and today's care", async () => {
    await as(db, user(STAFF), async () => {
      const today = (await db.query<{ d: string }>("select (now() at time zone 'Asia/Kolkata')::date::text as d")).rows[0].d;
      const counts = await db.query<{ status: string; n: number }>("select status::text, count(*)::int as n from public.bookings group by 1 order by 1");
      expect(Object.fromEntries(counts.rows.map((r) => [r.status, r.n]))).toEqual({ checked_in: 4, confirmed: 4, requested: 1 });
      const overstay = await db.query<{ n: number }>("select count(*)::int as n from public.bookings where status = 'checked_in' and end_date < $1", [today]);
      expect(overstay.rows[0].n).toBe(1);
      const families = await db.query<{ n: number }>("select count(distinct group_id)::int as n from public.bookings where group_id is not null");
      expect(families.rows[0].n).toBe(2);
      const tasks = await db.query<{ n: number; done: number }>(
        "select count(*)::int as n, count(*) filter (where status = 'done')::int as done from public.care_tasks where task_date = $1",
        [today],
      );
      // Four pets in house, four house routines each, plus one tablet.
      expect(tasks.rows[0]).toEqual({ n: 17, done: 2 });
    });
  });

  it("uses only invented people: every phone number is in the demo range", async () => {
    await as(db, user(OWNER), async () => {
      const phones = await db.query<{ phone: string }>("select phone from public.clients");
      expect(phones.rows.every((r) => r.phone.startsWith("+9198000"))).toBe(true);
    });
  });
});
