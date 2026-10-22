import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember } from "./fixtures";
import { admin, as, createTestDb, createUser, errorOf, user } from "./harness";
import { dayFromToday, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Roadmap M31, D45: riders are a fourth role with the least access of any.
 * A rider signs in and finds nothing but their own run for the day: names,
 * addresses, phones, packs and notes. No prices, no medical notes, no other
 * parents, no table at all.
 */

let db: PGlite;
let k: Kitchen;
let staff: string;
let rider: string;
let otherRider: string;
let today: string;
let run: string;
let stop: string;
let notMine: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKitchen(db);
  staff = await addMember(db, k, "staff");
  rider = await addMember(db, k, "rider");
  otherRider = await addMember(db, k, "rider");
  today = await dayFromToday(db, k, 0);
  await q(db, k.owner, "update public.pets set medical_notes = 'Epileptic: keep calm' where id = $1", [k.pets[0]]);
  // Two deliveries today, cooked and packed.
  await q(db, k.owner, "select public.record_purchase($1, $2, 10000, 1000, $3)", [k.org, k.chicken, today]);
  await q(db, k.owner, "select public.record_purchase($1, $2, 10000, 1000, $3)", [k.org, k.rice, today]);
  const [{ id: batch }] = await q<{ id: string }>(db, staff, "select public.record_batch($1, $2, 3000, 12, $3) as id", [k.org, k.versions[0], today]);
  const deliver = async (pet: string) =>
    (await q<{ id: string }>(
      db, staff,
      "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, grams, recipe_id, address_id, batch_id, status, note) values ($1, 'order', $2, $3, $4, $5, 1000, $6, $7, $8, 'packed', 'Ring twice') returning id",
      [k.org, k.client, pet, k.subscriptionFood, today, k.recipes[0], k.address, batch],
    ))[0].id;
  stop = await deliver(k.pets[0]);
  notMine = await deliver(k.pets[1]);
  [{ id: run }] = await q<{ id: string }>(db, staff, "insert into public.delivery_runs (org_id, run_date, slot, rider_id) values ($1, $2, 'morning', $3) returning id", [k.org, today, rider]);
  const [{ id: other }] = await q<{ id: string }>(db, staff, "insert into public.delivery_runs (org_id, run_date, slot, rider_id) values ($1, $2, 'morning', $3) returning id", [k.org, today, otherRider]);
  await q(db, staff, "update public.deliveries set run_id = $2, run_position = 1 where id = $1", [stop, run]);
  await q(db, staff, "update public.deliveries set run_id = $2, run_position = 1 where id = $1", [notMine, other]);
});
afterAll(() => db.close());

describe("a rider", () => {
  it("finds nothing in any table but their own membership", async () => {
    const tables = await as(db, admin, async () =>
      (await db.query<{ name: string }>(
        "select table_name as name from information_schema.tables where table_schema = 'public' order by 1",
      )).rows.map((r) => r.name),
    );
    expect(tables.length).toBeGreaterThan(40);
    const seen: string[] = [];
    for (const table of tables) {
      const result = await as(db, user(rider), async () => {
        try {
          return (await db.query<{ n: number }>(`select count(*)::int as n from public.${table}`)).rows[0].n;
        } catch {
          return 0;
        }
      });
      if (result > 0) seen.push(table);
    }
    expect(seen).toEqual(["memberships"]);
    expect(await q(db, rider, "select user_id from public.memberships")).toEqual([{ user_id: rider }]);
  });

  it("sees their own run for today: who, where, packs and notes, and no prices or medical notes", async () => {
    const [{ runs }] = await q<{ runs: { run_id: string; stops: Record<string, unknown>[] }[] }>(db, rider, "select public.my_runs($1) as runs", [today]);
    expect(runs.map((r) => r.run_id)).toEqual([run]);
    expect(runs[0].stops).toHaveLength(1);
    const s = runs[0].stops[0];
    expect(s).toMatchObject({ delivery_id: stop, packs: 4, line: "12 First Cross", postal_code: "560038", note: "Ring twice" });
    expect(String(s.name)).toMatch(/^Parent \d+$/);
    const text = JSON.stringify(runs);
    expect(text).not.toMatch(/price|Epileptic|medical|_minor/);
    // Another day, nothing.
    const [{ runs: tomorrow }] = await q<{ runs: unknown[] }>(db, rider, "select public.my_runs(($1::date + 1)) as runs", [today]);
    expect(tomorrow).toEqual([]);
  });

  it("marks only their own stops, today, and adds only their own stop's photo", async () => {
    const path = `${k.org}/deliveries/${stop}/door.jpg`;
    const [{ ok }] = await q<{ ok: boolean }>(db, rider, "select public.rider_upload_allowed($1) as ok", [path]);
    expect(ok).toBe(true);
    const [{ ok: other }] = await q<{ ok: boolean }>(db, rider, "select public.rider_upload_allowed($1) as ok", [`${k.org}/deliveries/${notMine}/door.jpg`]);
    expect(other).toBe(false);
    const [{ ok: elsewhere }] = await q<{ ok: boolean }>(db, rider, "select public.rider_upload_allowed($1) as ok", [`${k.org}/pets/${k.pets[0]}/profile.jpg`]);
    expect(elsewhere).toBe(false);

    await q(db, rider, "select public.rider_mark_stop($1, 'out')", [stop]);
    await q(db, rider, "select public.rider_mark_stop($1, 'delivered', $2)", [stop, path]);
    const [d] = await q<{ status: string; proof_path: string; delivered_at: string | null }>(db, staff, "select status, proof_path, delivered_at from public.deliveries where id = $1", [stop]);
    expect([d.status, d.proof_path, d.delivered_at !== null]).toEqual(["delivered", path, true]);
    const theirs = await errorOf(() => q(db, rider, "select public.rider_mark_stop($1, 'delivered')", [notMine]));
    expect(theirs.message).toContain("WB003");
    const odd = await errorOf(() => q(db, rider, "select public.rider_mark_stop($1, 'cancelled')", [stop]));
    expect(odd.message).toContain("WB173");
  });

  it("is not a way into the kennel for anyone who is not its member", async () => {
    const stranger = await createUser(db, "stranger@example.test");
    const e = await errorOf(() => q(db, staff, "insert into public.delivery_runs (org_id, run_date, slot, rider_id) values ($1, $2, 'evening', $3)", [k.org, today, stranger]));
    expect(e.message).toContain("WB170");
    const wrongSlot = await errorOf(() => q(db, staff, "update public.deliveries set run_id = $2 where id = $1", [notMine, run]).then(() =>
      q(db, staff, "update public.deliveries set slot = 'evening' where id = $1", [notMine])));
    expect(wrongSlot.message).toMatch(/WB171|WB151/);
  });
});

describe("problems after a delivery", () => {
  it("are reported within the kennel's window, and replaced at no charge", async () => {
    await q(db, staff, "insert into public.delivery_problems (org_id, delivery_id, kind, note) values ($1, $2, 'damaged', 'Pack torn')", [k.org, stop]);
    const notDelivered = await errorOf(() => q(db, staff, "insert into public.delivery_problems (org_id, delivery_id, kind) values ($1, $2, 'late')", [k.org, notMine]));
    expect(notDelivered.message).toContain("WB174");
    await as(db, admin, () => db.query("update public.deliveries set delivered_at = now() - interval '25 hours' where id = $1", [stop]));
    const late = await errorOf(() => q(db, staff, "insert into public.delivery_problems (org_id, delivery_id, kind) values ($1, $2, 'wrong')", [k.org, stop]));
    expect(late.message).toContain("WB174");

    const [{ id: again, price_minor }] = await q<{ id: string; price_minor: string }>(
      db, staff,
      "insert into public.deliveries (org_id, kind, client_id, pet_id, delivery_date, grams, recipe_id, address_id, replaces_id) values ($1, 'replacement', $2, $3, ($4::date + 1), 1000, $5, $6, $7) returning id, price_minor",
      [k.org, k.client, k.pets[0], today, k.recipes[0], k.address, stop],
    );
    expect(Number(price_minor)).toBe(0);
    await q(db, staff, "update public.delivery_problems set outcome = 'replaced', replacement_id = $2, resolved_at = now() where delivery_id = $1", [stop, again]);
    const [p] = await q<{ resolved_by: string }>(db, staff, "select resolved_by from public.delivery_problems where delivery_id = $1", [stop]);
    expect(p.resolved_by).toBe(staff);
  });
});
