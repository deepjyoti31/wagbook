import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember, book } from "./fixtures";
import { createTestDb, errorOf } from "./harness";
import { dayFromToday, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Roadmap M26, M28 and M30: a week of buying, cooking and throwing away adds
 * up to a stock take; portions set by hand are a manager's; a batch takes its
 * ingredients out of stock, packs come only from a batch of their own recipe
 * within its date, and "who got batch N" is answered.
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
const onHand = async (item: string) => Number((await q<{ on_hand: string }>(db, staff, "select on_hand from public.stock_levels where item_id = $1", [item]))[0].on_hand);
const buy = (item: string, grams: number, on: string) => q(db, manager, "select public.record_purchase($1, $2, $3, 100000, $4)", [k.org, item, grams, on]);
const cook = (version: string, grams: number, on: string, boardersOn: string | null = null) =>
  q<{ id: string }>(db, staff, "select public.record_batch($1, $2, $3, $4, $5, null, $6) as id", [k.org, version, grams, Math.ceil(grams / 250), on, boardersOn]).then((r) => r[0].id);
const waste = (item: string, grams: number, on: string) =>
  q(db, staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, reason) values ($1, $2, 'waste', $3, $4, 'spoiled')", [k.org, item, -grams, on]);

describe("a week in the kitchen", () => {
  it("adds up to a stock take", async () => {
    // Monday: 20 kg chicken, 15 kg rice, 8 kg fish.
    await buy(k.chicken, 20_000, "2027-03-01");
    await buy(k.rice, 15_000, "2027-03-01");
    await buy(k.fish, 8_000, "2027-03-01");
    // Tuesday: 10 kg chicken and rice (600 g and 400 g a kilo); Thursday: 6 kg fish and rice (650 g and 350 g).
    await cook(k.versions[0], 10_000, "2027-03-02");
    await cook(k.versions[1], 6_000, "2027-03-04");
    // Friday: 1.2 kg chicken spoiled; Saturday: 10 kg chicken more.
    await waste(k.chicken, 1_200, "2027-03-05");
    await buy(k.chicken, 10_000, "2027-03-06");
    // By hand: chicken 20 - 6 - 1.2 + 10 = 22.8 kg; rice 15 - 4 - 2.1 = 8.9 kg; fish 8 - 3.9 = 4.1 kg.
    expect([await onHand(k.chicken), await onHand(k.rice), await onHand(k.fish)]).toEqual([22_800, 8_900, 4_100]);
    // Sunday's stock take finds the shelves agree for chicken and fish, and 100 g of rice short.
    for (const [item, counted] of [[k.chicken, 22_800], [k.rice, 8_800], [k.fish, 4_100]] as const) {
      await q(db, staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, counted) values ($1, $2, 'count', 0, '2027-03-07', $3)", [k.org, item, counted]);
    }
    const takes = await q<{ item_id: string; quantity: string }>(db, staff, "select item_id, quantity from public.stock_moves where org_id = $1 and kind = 'count'", [k.org]);
    const difference = (item: string) => Number(takes.find((t) => t.item_id === item)!.quantity);
    expect([difference(k.chicken), difference(k.rice), difference(k.fish)]).toEqual([0, -100, 0]);
    expect(await onHand(k.rice)).toBe(8_800);
  });

  it("refuses a batch the stock cannot cover, as a whole", async () => {
    const before = await onHand(k.chicken);
    const e = await fails(staff, "select public.record_batch($1, $2, 100000, 400, '2027-03-08')", [k.org, k.versions[0]]);
    expect(e.message).toContain("WB130");
    expect(await onHand(k.chicken)).toBe(before);
    expect(await q(db, staff, "select id from public.batches where cooked_on = '2027-03-08'")).toHaveLength(0);
  });

  it("numbers batches by day and gives them their recipe's use-by date", async () => {
    const [b] = await q<{ number: string; use_by: string; recipe_id: string }>(db, staff, "select number, use_by::text, recipe_id from public.batches where org_id = $1 order by number", [k.org]);
    expect(b).toEqual({ number: "270302-1", use_by: "2027-03-05", recipe_id: k.recipes[0] });
  });
});

describe("portions", () => {
  it("are set by hand only by owners and managers, with a note", async () => {
    const e = await fails(staff, "insert into public.pet_food (org_id, pet_id, grams_by_hand, by_hand_note) values ($1, $2, 420, 'Vet said less')", [k.org, k.pets[0]]);
    expect(e.message).toContain("WB146");
    const noNote = await fails(manager, "insert into public.pet_food (org_id, pet_id, grams_by_hand) values ($1, $2, 420)", [k.org, k.pets[0]]);
    expect(noNote.message).toContain("pet_food_by_hand_has_note");
    await q(db, manager, "insert into public.pet_food (org_id, pet_id, grams_by_hand, by_hand_note) values ($1, $2, 420, 'Vet said less')", [k.org, k.pets[0]]);
    // Staff still change the rest: the plan, what it eats boarding, foods to avoid.
    await q(db, staff, "update public.pet_food set plan = 'topper', boarder_food = 'kibble', kibble_brand = 'Royal Canin Medium', avoid = 'Chicken' where pet_id = $1", [k.pets[0]]);
    const change = await fails(staff, "update public.pet_food set grams_by_hand = 500 where pet_id = $1", [k.pets[0]]);
    expect(change.message).toContain("WB146");
    const kibble = await fails(staff, "update public.pet_food set kibble_brand = null where pet_id = $1", [k.pets[0]]);
    expect(kibble.message).toContain("pet_food_kibble_named");
  });
});

describe("batches and packing", () => {
  let delivery: string;
  let day: string;
  beforeAll(async () => {
    day = await dayFromToday(db, k, 3);
    [{ id: delivery }] = await q<{ id: string }>(
      db, staff,
      "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, grams, recipe_id, address_id) values ($1, 'order', $2, $3, $4, $5, 1000, $6, $7) returning id",
      [k.org, k.client, k.pets[1], k.subscriptionFood, day, k.recipes[0], k.address],
    );
    await buy(k.chicken, 20_000, day);
    await buy(k.fish, 20_000, day);
    await buy(k.rice, 20_000, day);
  });

  it("packs a delivery only from a batch of its own recipe, within its date", async () => {
    const fishBatch = await cook(k.versions[1], 2_000, day);
    const wrong = await fails(staff, "update public.deliveries set batch_id = $2, status = 'packed' where id = $1", [delivery, fishBatch]);
    expect(wrong.message).toContain("WB160");
    const old = await cook(k.versions[0], 2_000, await dayFromToday(db, k, -1));
    const stale = await fails(staff, "update public.deliveries set batch_id = $2, status = 'packed' where id = $1", [delivery, old]);
    expect(stale.message).toContain("WB161");
    const unpacked = await fails(staff, "update public.deliveries set status = 'packed' where id = $1", [delivery]);
    expect(unpacked.message).toContain("deliveries_packed_from_batch");
    const good = await cook(k.versions[0], 4_000, day, day);
    await q(db, staff, "update public.deliveries set batch_id = $2, status = 'packed', packed_at = now() where id = $1", [delivery, good]);
    const [p] = await q<{ packed_by: string }>(db, staff, "select packed_by from public.deliveries where id = $1", [delivery]);
    expect(p.packed_by).toBe(staff);
  });

  it("answers who received a batch: deliveries and boarders on the kitchen's food", async () => {
    const [{ id: batch }] = await q<{ id: string }>(db, staff, "select id from public.batches where org_id = $1 and boarders_on = $2", [k.org, day]);
    // Two boarders in house that day: one on the kitchen's food, one on kibble (pet 0, set above).
    const kitchenPet = k.pets[2];
    for (const pet of [kitchenPet, k.pets[0]]) {
      const id = await book(db, k, { pet, start: await dayFromToday(db, k, 1), end: await dayFromToday(db, k, 5) });
      await q(db, staff, "update public.bookings set status = 'checked_in' where id = $1", [id]);
    }
    const got = await q<{ kind: string; pet_id: string; delivery_id: string | null }>(db, staff, "select kind, pet_id, delivery_id from public.batch_recipients($1, $2)", [k.org, batch]);
    expect(got.map((g) => g.kind).sort()).toEqual(["boarder", "delivery"]);
    expect(got.find((g) => g.kind === "delivery")!.delivery_id).toBe(delivery);
    expect(got.find((g) => g.kind === "boarder")!.pet_id).toBe(kitchenPet);
  });
});
