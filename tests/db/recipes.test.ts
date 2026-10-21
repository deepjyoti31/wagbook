import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember } from "./fixtures";
import { createTestDb, errorOf } from "./harness";
import { q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Roadmap M27: recipes. Versions never change; a batch keeps the version it
 * was cooked from and is costed from it; nothing a dog must never eat goes
 * in; a cooked recipe is retired, never deleted.
 */

let db: PGlite;
let k: Kitchen;
let staff: string;
let manager: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKitchen(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
});
afterAll(() => db.close());

const fails = (actor: string, sql: string, params: unknown[] = []) => errorOf(() => q(db, actor, sql, params));
const buy = (item: string, grams: number, cost: number, on: string) =>
  q(db, manager, "select public.record_purchase($1, $2, $3, $4, $5)", [k.org, item, grams, cost, on]);

describe("recipes", () => {
  it("never use what a dog must never eat", async () => {
    const [{ id: onion }] = await q<{ id: string }>(db, k.owner, "insert into public.stock_items (org_id, name, unit, kind, never_in_recipe) values ($1, 'Onion', 'g', 'vegetable', true) returning id", [k.org]);
    const e = await fails(manager, "select public.save_recipe_version($1, '{}', $2)", [k.recipes[0], JSON.stringify([{ item_id: onion, quantity_per_kg: 10 }])]);
    expect(e.message).toContain("WB140");
    // And an item a recipe uses cannot be marked so without a new version first.
    const marked = await fails(manager, "update public.stock_items set never_in_recipe = true where id = $1", [k.chicken]);
    expect(marked.message).toContain("WB140");
  });

  it("are changed only by owners and managers, as a new version, never in place", async () => {
    const byStaff = await fails(staff, "select public.save_recipe_version($1, '{}', $2)", [k.recipes[0], JSON.stringify([{ item_id: k.chicken, quantity_per_kg: 700 }])]);
    expect(byStaff.message).toContain("WB142");
    const empty = await fails(manager, "select public.save_recipe_version($1, '{}', '[]')", [k.recipes[0]]);
    expect(empty.message).toContain("WB143");
    const changed = await fails(k.owner, "update public.recipe_ingredients set quantity_per_kg = 1 where version_id = $1", [k.versions[0]]);
    expect(changed.message).toMatch(/permission denied/);
    const added = await fails(k.owner, "insert into public.recipe_ingredients (org_id, version_id, item_id, quantity_per_kg) values ($1, $2, $3, 5)", [k.org, k.versions[0], k.fish]);
    expect(added.message).toContain("WB141");
    // Staff read them, to cook from.
    expect(await q(db, staff, "select * from public.recipe_ingredients where version_id = $1", [k.versions[0]])).toHaveLength(2);
  });

  it("are costed per kilo from the latest prices, by version, for owners and managers", async () => {
    // Chicken ₹220 a kilo, rice ₹60 a kilo.
    await buy(k.chicken, 10_000, 220_000, "2027-03-01");
    await buy(k.rice, 10_000, 60_000, "2027-03-01");
    // Version 1: 600 g chicken and 400 g rice a kilo: ₹132 + ₹24 = ₹156.
    const cost = async (version: string, on: string | null = null) =>
      (await q<{ c: string | null }>(db, manager, "select public.recipe_cost_per_kg($1, $2, $3) as c", [k.org, version, on]))[0].c;
    expect(Number(await cost(k.versions[0]))).toBe(15_600);
    const e = await fails(staff, "select public.recipe_cost_per_kg($1, $2)", [k.org, k.versions[0]]);
    expect(e.message).toContain("WB145");
    // Fish was never bought with a price: no cost rather than a wrong one.
    expect(await cost(k.versions[1])).toBeNull();
  });

  it("keep two versions apart: a batch of each is costed from its own", async () => {
    const [{ v: v2 }] = await q<{ v: string }>(db, manager, "select public.save_recipe_version($1, $2, $3) as v", [
      k.recipes[0],
      JSON.stringify({ good_for: "More rice for a lighter meal", signed_off_by: "Dr Rao", signed_off_on: "2027-03-01" }),
      JSON.stringify([{ item_id: k.chicken, quantity_per_kg: 400 }, { item_id: k.rice, quantity_per_kg: 600 }]),
    ]);
    const [current] = await q<{ version_id: string; version: number }>(db, staff, "select version_id, version from public.recipe_current where recipe_id = $1", [k.recipes[0]]);
    expect(current).toEqual({ version_id: v2, version: 2 });

    const batch = async (version: string) =>
      (await q<{ id: string }>(db, staff, "select public.record_batch($1, $2, 2000, 8, '2027-03-02') as id", [k.org, version]))[0].id;
    const b1 = await batch(k.versions[0]);
    const b2 = await batch(v2);
    // Chicken goes up afterwards; the batches were cooked at the old price.
    await buy(k.chicken, 5_000, 150_000, "2027-03-03");
    const batchCost = async (id: string) => Number((await q<{ c: string }>(db, manager, "select public.batch_cost($1, $2) as c", [k.org, id]))[0].c);
    // 2 kg of version 1 at ₹156 a kilo; 2 kg of version 2 at ₹88 + ₹36 = ₹124 a kilo.
    expect(await batchCost(b1)).toBe(31_200);
    expect(await batchCost(b2)).toBe(24_800);
    const [{ version_id }] = await q<{ version_id: string }>(db, staff, "select version_id from public.batches where id = $1", [b1]);
    expect(version_id).toBe(k.versions[0]);
  });

  it("are retired, never deleted, once cooked", async () => {
    const e = await fails(k.owner, "delete from public.recipes where id = $1", [k.recipes[0]]);
    expect(e.message).toContain("WB144");
    const out = await fails(manager, "update public.recipes set is_retired = true where id = $1", [k.recipes[0]]);
    expect(out.message).toContain("recipes_retired_out_of_rotation");
    await q(db, manager, "update public.recipes set is_retired = true, rotation_position = null where id = $1", [k.recipes[0]]);
    // A recipe never cooked can go.
    const [{ id }] = await q<{ id: string }>(db, manager, "insert into public.recipes (org_id, name) values ($1, 'Lamb') returning id", [k.org]);
    expect(await q(db, k.owner, "delete from public.recipes where id = $1 returning id", [id])).toHaveLength(1);
  });

  it("hold one place each in the rotation", async () => {
    const e = await fails(manager, "insert into public.recipes (org_id, name, rotation_position) values ($1, 'Mutton', 2)", [k.org]);
    expect(e.message).toContain("recipes_one_per_rotation_place");
  });
});
