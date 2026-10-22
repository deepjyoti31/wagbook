import type { PGlite } from "@electric-sql/pglite";
import { billFor, draftPayload } from "../../src/lib/billing";
import type { InvoiceTotals } from "../../src/lib/core";
import { foodLines, type BillableDelivery } from "../../src/lib/food-bill";
import { seedKennel, type Kennel } from "./fixtures";
import { admin, as, user } from "./harness";

/** A kennel with a kitchen: food delivery on, an area, two recipes in the rotation, subscription food at ₹400 a kilo. */
export interface Kitchen extends Kennel {
  chicken: string;
  rice: string;
  fish: string;
  recipes: string[];
  versions: string[];
  subscriptionFood: string;
  trialFood: string;
  cake: string;
  address: string;
}

export async function q<T>(db: PGlite, actor: string, sql: string, params: unknown[] = []): Promise<T[]> {
  return as(db, user(actor), async () => (await db.query<T>(sql, params)).rows);
}

export async function seedKitchen(db: PGlite): Promise<Kitchen> {
  const k = await seedKennel(db);
  const o = k.owner;
  await q(db, o, "update public.organizations set offers_kitchen = true, offers_food_delivery = true where id = $1", [k.org]);
  await q(db, o, "insert into public.service_areas (org_id, postal_code, name, delivery_charge_minor) values ($1, '560038', 'Indiranagar', 5000)", [k.org]);
  const [{ id: address }] = await q<{ id: string }>(db, o, "insert into public.client_addresses (org_id, client_id, line, postal_code) values ($1, $2, '12 First Cross', '560038') returning id", [k.org, k.client]);
  const item = async (name: string) =>
    (await q<{ id: string }>(db, o, "insert into public.stock_items (org_id, name, unit, kind) values ($1, $2, 'g', 'meat') returning id", [k.org, name]))[0].id;
  const chicken = await item("Chicken");
  const rice = await item("Rice");
  const fish = await item("Fish");
  const recipe = async (name: string, place: number, ingredients: [string, number][]) => {
    const [{ id }] = await q<{ id: string }>(db, o, "insert into public.recipes (org_id, name, rotation_position) values ($1, $2, $3) returning id", [k.org, name, place]);
    const [{ v }] = await q<{ v: string }>(db, o, "select public.save_recipe_version($1, '{}', $2) as v", [
      id, JSON.stringify(ingredients.map(([item_id, quantity_per_kg]) => ({ item_id, quantity_per_kg }))),
    ]);
    return { id, v };
  };
  const a = await recipe("Chicken and rice", 1, [[chicken, 600], [rice, 400]]);
  const b = await recipe("Fish and rice", 2, [[fish, 650], [rice, 350]]);
  const product = async (kind: string, name: string, price: number, trialGrams: number | null = null) =>
    (await q<{ id: string }>(db, o, "insert into public.food_products (org_id, kind, name, price_minor, trial_grams) values ($1, $2, $3, $4, $5) returning id", [k.org, kind, name, price, trialGrams]))[0].id;
  return {
    ...k,
    chicken, rice, fish,
    recipes: [a.id, b.id],
    versions: [a.v, b.v],
    subscriptionFood: await product("subscription", "Fresh food", 40000),
    trialFood: await product("trial", "Food trial", 49900, 1000),
    cake: await product("item", "Birthday cake", 120000),
    address,
  };
}

/** The kennel's date, `days` from today. */
export async function dayFromToday(db: PGlite, k: Kennel, days: number): Promise<string> {
  return as(db, admin, async () => (await db.query<{ d: string }>("select (public.org_today($1) + $2::integer)::text as d", [k.org, days])).rows[0].d);
}

const org = { tax_mode: "none" as const, gst_state_code: null, prices_include_tax: false, round_invoice_totals: true };

/** A food bill as the app builds it (foodLines), from the deliveries as they are now. */
export async function foodBill(db: PGlite, actor: string, k: Kennel, scope: { subscription: string; from: string; to: string } | { delivery: string }, discountBp = 0): Promise<InvoiceTotals> {
  const where = "subscription" in scope ? "d.subscription_id = $2 and d.delivery_date between $3 and $4" : "d.id = $2";
  const params = "subscription" in scope ? [k.org, scope.subscription, scope.from, scope.to] : [k.org, scope.delivery];
  const rows = await q<BillableDelivery>(
    db, actor,
    `select d.kind, d.status, d.delivery_date::text, d.grams, d.quantity, d.unit_price_minor::int, d.delivery_charge_minor::int, d.tax_rate_bp, d.sac_code, p.name as product_name
     from public.deliveries d left join public.food_products p on p.id = d.product_id where d.org_id = $1 and ${where} order by d.delivery_date`,
    params,
  );
  return billFor(org, foodLines("Bruno", rows, discountBp));
}

/** Save a food bill as a draft and issue it, as `actor`. Returns its id. */
export async function issueFoodBill(db: PGlite, actor: string, k: Kennel, scope: { subscription: string; from: string; to: string } | { delivery: string }, t: InvoiceTotals): Promise<string> {
  return as(db, user(actor), async () => {
    const r = "subscription" in scope
      ? await db.query<{ id: string }>("insert into public.invoices (org_id, client_id, subscription_id, period_start, period_end) values ($1, $2, $3, $4, $5) returning id", [k.org, k.client, scope.subscription, scope.from, scope.to])
      : await db.query<{ id: string }>("insert into public.invoices (org_id, client_id, delivery_id) values ($1, $2, $3) returning id", [k.org, k.client, scope.delivery]);
    const { p_totals, p_lines } = draftPayload(t);
    await db.query("select public.save_invoice_draft($1, $2, $3)", [r.rows[0].id, JSON.stringify(p_totals), JSON.stringify(p_lines)]);
    await db.query("select public.issue_invoice($1)", [r.rows[0].id]);
    return r.rows[0].id;
  });
}
