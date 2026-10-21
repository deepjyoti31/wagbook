import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addDays, todayIn } from "../../src/lib/core";
import { addMember, seedKennel, strangerPet, type Kennel } from "./fixtures";
import { anon, as, createTestDb, errorOf, user } from "./harness";

/**
 * A known parent asks for a stay through their own booking link. Each pet
 * asked for becomes a request at the usual price, which holds no kennel.
 */

let db: PGlite;
let k: Kennel;
let staff: string;
let token: string;
const today = todayIn("Asia/Kolkata");

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKennel(db, { kennels: 1, pets: 3 });
  staff = await addMember(db, k, "staff");
  await as(db, user(k.owner), async () => {
    await db.query("insert into public.services (org_id, kind, name, unit, price_minor, is_default) values ($1, 'boarding', 'Boarding', 'night', 120000, true)", [k.org]);
    token = (await db.query<{ request_token: string }>("select request_token from public.clients where id = $1", [k.client])).rows[0].request_token;
  });
});
afterAll(() => db.close());

const form = (t = token) => as(db, anon, async () => (await db.query<{ v: Record<string, unknown> | null }>("select public.get_public_booking_form($1) as v", [t])).rows[0].v);
const ask = (payload: object, t = token) =>
  as(db, anon, async () => (await db.query<{ n: number }>("select public.submit_booking_request($1, $2) as n", [t, JSON.stringify(payload)])).rows[0].n);

describe("a parent's booking link", () => {
  it("shows the parent their own pets and the kinds of stay they can ask for, and nothing private", async () => {
    const v = (await form()) as { parent: string; pets: { name: string }[]; kinds: string[]; stays: unknown[]; enabled: boolean };
    expect(v.parent).toMatch(/^Parent$/);
    expect(v.pets.map((p) => p.name)).toHaveLength(3);
    expect(v.kinds).toEqual(["boarding"]);
    expect(v.enabled).toBe(true);
    expect(JSON.stringify(v)).not.toContain("+9198765");
    expect(await form("f".repeat(64))).toBeNull();
  });

  it("turns each pet asked for into a request at the usual price, holding no kennel", async () => {
    const n = await ask({ kind: "boarding", start_date: addDays(today, 10), end_date: addDays(today, 13), pet_ids: [k.pets[0], k.pets[1]], note: "Both together please" });
    expect(n).toBe(2);
    const rows = await as(db, user(staff), async () =>
      (await db.query<{ status: string; source: string; rate_minor: number; kennel_id: string | null; group_id: string | null; notes: string }>(
        "select status, source, rate_minor, kennel_id, group_id, notes from public.bookings where org_id = $1 and source = 'parent'",
        [k.org],
      )).rows,
    );
    expect(rows).toHaveLength(2);
    for (const r of rows) expect(r).toMatchObject({ status: "requested", source: "parent", rate_minor: 120000, kennel_id: null, notes: "Both together please" });
    expect(rows[0].group_id).not.toBeNull();
    expect(rows[0].group_id).toBe(rows[1].group_id);
    const v = (await form()) as { stays: { status: string }[] };
    expect(v.stays.map((s) => s.status)).toEqual(["requested", "requested"]);
  });

  it("refuses another parent's pet, past dates, a kind with no price, and a malformed request", async () => {
    const other = await strangerPet(db, k);
    expect((await errorOf(() => ask({ kind: "boarding", start_date: addDays(today, 5), end_date: addDays(today, 6), pet_ids: [other] }))).message).toContain("WB102");
    expect((await errorOf(() => ask({ kind: "boarding", start_date: addDays(today, 5), end_date: addDays(today, 6), pet_ids: [k.pets[0], other] }))).message).toContain("WB102");
    expect((await errorOf(() => ask({ kind: "boarding", start_date: addDays(today, -1), end_date: addDays(today, 2), pet_ids: [k.pets[0]] }))).message).toContain("WB103");
    expect((await errorOf(() => ask({ kind: "boarding", start_date: addDays(today, 5), end_date: addDays(today, 5), pet_ids: [k.pets[0]] }))).message).toContain("WB103");
    expect((await errorOf(() => ask({ kind: "boarding", start_date: addDays(today, 5), end_date: addDays(today, 200), pet_ids: [k.pets[0]] }))).message).toContain("WB103");
    expect((await errorOf(() => ask({ kind: "daycare", start_date: addDays(today, 5), pet_ids: [k.pets[0]] }))).message).toContain("WB104");
    expect((await errorOf(() => ask({ kind: "boarding", pet_ids: "all" }))).message).toContain("WB101");
  });

  it("stops at twelve pets asked for in a day", async () => {
    // Two already asked for above; five more requests of two pets would make twelve, the sixth is refused.
    for (let i = 0; i < 5; i++) await ask({ kind: "boarding", start_date: addDays(today, 20 + i), end_date: addDays(today, 21 + i), pet_ids: [k.pets[0], k.pets[1]] });
    expect((await errorOf(() => ask({ kind: "boarding", start_date: addDays(today, 40), end_date: addDays(today, 41), pet_ids: [k.pets[2]] }))).message).toContain("WB105");
  });

  it("stops working when the kennel turns requests off, or gives the parent a new link", async () => {
    const k2 = await seedKennel(db, { pets: 1 });
    const t2 = await as(db, user(k2.owner), async () => {
      await db.query("insert into public.services (org_id, kind, name, unit, price_minor, is_default) values ($1, 'boarding', 'Boarding', 'night', 100000, true)", [k2.org]);
      await db.query("update public.organizations set requests_enabled = false where id = $1", [k2.org]);
      return (await db.query<{ request_token: string }>("select request_token from public.clients where id = $1", [k2.client])).rows[0].request_token;
    });
    const payload = { kind: "boarding", start_date: addDays(today, 3), end_date: addDays(today, 4), pet_ids: [k2.pets[0]] };
    expect((await errorOf(() => ask(payload, t2))).message).toContain("WB100");
    await as(db, user(k2.owner), () => db.query("update public.organizations set requests_enabled = true where id = $1", [k2.org]));
    expect(await ask(payload, t2)).toBe(1);

    const renewed = await as(db, user(k2.owner), async () => (await db.query<{ t: string }>("select public.renew_request_link($1) as t", [k2.client])).rows[0].t);
    expect(renewed).not.toBe(t2);
    expect((await errorOf(() => ask(payload, t2))).message).toContain("WB100");
    // Nobody chooses a link by hand, and another kennel cannot renew it.
    expect((await errorOf(() => as(db, user(k2.owner), () => db.query("update public.clients set request_token = $2 where id = $1", [k2.client, "a".repeat(64)])))).message).toMatch(/permission denied/);
    expect((await errorOf(() => as(db, user(k.owner), () => db.query("select public.renew_request_link($1)", [k2.client])))).message).toContain("WB003");
  });
});
