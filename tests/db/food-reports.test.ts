import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember } from "./fixtures";
import { createTestDb, errorOf } from "./harness";
import { dayFromToday, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Roadmap M33: food reports, for owners and managers only, refused in the
 * database (as D20).
 */

let db: PGlite;
let k: Kitchen;
let staff: string;
let manager: string;
let rider: string;
let today: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKitchen(db);
  staff = await addMember(db, k, "staff");
  manager = await addMember(db, k, "manager");
  rider = await addMember(db, k, "rider");
  today = await dayFromToday(db, k, 0);
  await q(db, manager, "update public.memberships set display_name = 'Ravi' where org_id = $1 and user_id = $2", [k.org, rider]);
  // Bought, cooked and wasted today.
  await q(db, manager, "select public.record_purchase($1, $2, 10000, 220000, $3)", [k.org, k.chicken, today]);
  await q(db, manager, "select public.record_purchase($1, $2, 10000, 60000, $3)", [k.org, k.rice, today]);
  const [{ id: batch }] = await q<{ id: string }>(db, staff, "select public.record_batch($1, $2, 5000, 20, $3) as id", [k.org, k.versions[0], today]);
  await q(db, staff, "insert into public.stock_moves (org_id, item_id, kind, quantity, happened_on, reason) values ($1, $2, 'waste', -500, $3, 'spoiled')", [k.org, k.chicken, today]);
  // A trial handed over today by Ravi, and the parent subscribed straight after.
  const [{ id: trial }] = await q<{ id: string }>(
    db, staff,
    "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, recipe_id, address_id, batch_id, status) values ($1, 'trial', $2, $3, $4, $5, $6, $7, $8, 'packed') returning id",
    [k.org, k.client, k.pets[0], k.trialFood, today, k.recipes[0], k.address, batch],
  );
  const [{ id: run }] = await q<{ id: string }>(db, staff, "insert into public.delivery_runs (org_id, run_date, slot, rider_id) values ($1, $2, 'morning', $3) returning id", [k.org, today, rider]);
  await q(db, staff, "update public.deliveries set run_id = $2 where id = $1", [trial, run]);
  await q(db, rider, "select public.rider_mark_stop($1, 'delivered')", [trial]);
  await q(db, staff, "insert into public.subscriptions (org_id, client_id, pet_id, product_id, grams_per_day, weekdays, starts_on, source) values ($1, $2, $3, $4, 500, '{2,5}', $5, 'boarding')", [k.org, k.client, k.pets[0], k.subscriptionFood, today]);
});
afterAll(() => db.close());

describe("food reports", () => {
  it("are refused to staff and riders, in the database", async () => {
    for (const who of [staff, rider]) {
      for (const f of ["report_food", "report_food_riders", "report_food_sources"]) {
        const e = await errorOf(() => q(db, who, `select * from public.${f}($1, $2, $3)`, [k.org, today, today]));
        expect(e.message).toContain("WB060");
      }
    }
  });

  it("count the month's subscriptions, trials, deliveries, cooking, cost and waste", async () => {
    const [m] = await q<Record<string, string | number>>(db, manager, "select * from public.report_food($1, $2, $2)", [k.org, today]);
    expect({
      active: m.active_subscriptions, started: m.subscriptions_started, trials: m.trials, subscribed: m.trials_subscribed,
      deliveries: m.deliveries, kilos: Number(m.kilos_delivered), value: Number(m.food_value_minor),
      cooked: Number(m.kilos_cooked), cost: Number(m.cooking_cost_minor), wasted: Number(m.wasted_g), wastedCost: Number(m.wasted_cost_minor),
    }).toEqual({
      active: 1, started: 1, trials: 1, subscribed: 1,
      deliveries: 1, kilos: 1, value: 49900 + 5000,
      // 5 kg of chicken and rice: 600 g chicken at ₹220 a kilo and 400 g rice at ₹60 a kilo, ₹156 a kilo.
      cooked: 5, cost: 78000,
      // 500 g of chicken at ₹22 for 100 g.
      wasted: 500, wastedCost: 11000,
    });
  });

  it("count deliveries per rider per day, and where customers came from", async () => {
    const riders = await q<{ rider_name: string; delivered: number }>(db, manager, "select rider_name, delivered from public.report_food_riders($1, $2, $2)", [k.org, today]);
    expect(riders).toEqual([{ rider_name: "Ravi", delivered: 1 }]);
    const sources = await q<{ source: string; started: number; still_active: number }>(db, k.owner, "select * from public.report_food_sources($1, $2, $2)", [k.org, today]);
    expect(sources).toEqual([{ source: "boarding", started: 1, still_active: 1 }]);
  });

  it("answer only for the kennel asked about", async () => {
    const other = await seedKitchen(db);
    const e = await errorOf(() => q(db, other.owner, "select * from public.report_food($1, $2, $2)", [k.org, today]));
    expect(e.message).toContain("WB060");
  });
});
