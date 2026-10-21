import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { billFor } from "../../src/lib/billing";
import { creditForChangeLines } from "./credit-helpers";
import { addMember } from "./fixtures";
import { createTestDb, errorOf } from "./harness";
import { dayFromToday, foodBill, issueFoodBill, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Roadmap M29: subscriptions and orders. A subscription two days a week makes
 * its deliveries ahead, is paused, resumed, changed and cancelled; changes
 * close at the cut-off; it is billed ahead and credited for what is
 * cancelled. Grams, recipe and price are copied onto each delivery.
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

const org = { tax_mode: "none" as const, gst_state_code: null, prices_include_tax: false, round_invoice_totals: true };
const fails = (actor: string, sql: string, params: unknown[] = []) => errorOf(() => q(db, actor, sql, params));

interface Delivery {
  id: string;
  delivery_date: string;
  covers_days: number;
  grams: number;
  packs: number;
  recipe_id: string;
  price_minor: string;
  delivery_charge_minor: string;
  status: string;
}

const deliveries = (sub: string, all = false) =>
  q<Delivery>(
    db, staff,
    `select id, delivery_date::text, covers_days, grams, packs, recipe_id, price_minor, delivery_charge_minor, status from public.deliveries
     where subscription_id = $1 ${all ? "" : "and status <> 'cancelled'"} order by delivery_date`,
    [sub],
  );

/** The next date from today on this ISO weekday, at least `after` days ahead. */
async function next(weekday: number, after: number): Promise<string> {
  for (let i = after; i < after + 7; i++) {
    const d = await dayFromToday(db, k, i);
    const w = new Date(`${d}T00:00:00Z`).getUTCDay() || 7;
    if (w === weekday) return d;
  }
  throw new Error("unreachable");
}

describe("a subscription two days a week", () => {
  let sub: string;
  let tuesday: string;

  beforeAll(async () => {
    tuesday = await next(2, 3);
    [{ id: sub }] = await q<{ id: string }>(
      db, staff,
      `insert into public.subscriptions (org_id, client_id, pet_id, product_id, grams_per_day, weekdays, address_id, starts_on)
       values ($1, $2, $3, $4, 500, '{2,5}', $5, $6) returning id`,
      [k.org, k.client, k.pets[0], k.subscriptionFood, k.address, tuesday],
    );
    await q(db, staff, "select public.plan_subscription($1, ($2::date + 20))", [sub, tuesday]);
  });

  it("makes its deliveries ahead: each covers the days to the next, in whole packs, at the rate card's price, with the next recipe", async () => {
    const d = await deliveries(sub);
    expect(d).toHaveLength(6);
    expect(d.slice(0, 2).map((x) => [x.covers_days, x.grams, x.packs, Number(x.price_minor), Number(x.delivery_charge_minor)])).toEqual([
      [3, 1500, 6, 60000, 5000],
      [4, 2000, 8, 80000, 5000],
    ]);
    // The rotation: a new recipe each delivery, round again after the last.
    expect(d.map((x) => x.recipe_id)).toEqual([k.recipes[0], k.recipes[1], k.recipes[0], k.recipes[1], k.recipes[0], k.recipes[1]]);
    // Planning again makes nothing twice.
    const [{ n }] = await q<{ n: number }>(db, staff, "select public.plan_subscription($1, ($2::date + 20)) as n", [sub, tuesday]);
    expect(n).toBe(0);
    const twice = await fails(staff, "insert into public.deliveries (org_id, kind, client_id, pet_id, subscription_id, product_id, delivery_date, grams) values ($1, 'subscription', $2, $3, $4, $5, $6, 500)", [k.org, k.client, k.pets[0], sub, k.subscriptionFood, tuesday]);
    expect(twice.message).toContain("deliveries_one_per_subscription_day");
  });

  it("keeps a planned delivery's price when the rate card changes, and staff cannot set one", async () => {
    await q(db, manager, "update public.food_products set price_minor = 45000 where id = $1", [k.subscriptionFood]);
    const [first] = await deliveries(sub);
    expect(Number(first.price_minor)).toBe(60000);
    const e = await fails(staff, "update public.deliveries set unit_price_minor = 1 where id = $1", [first.id]);
    expect(e.message).toContain("WB022");
    await q(db, manager, "update public.food_products set price_minor = 40000 where id = $1", [k.subscriptionFood]);
  });

  it("is paused for a week and resumed", async () => {
    const before = await deliveries(sub);
    await q(db, staff, "update public.subscriptions set paused_from = $2, paused_until = ($2::date + 6) where id = $1", [sub, before[2].delivery_date]);
    const paused = await deliveries(sub);
    expect(paused.map((x) => x.delivery_date)).toEqual([before[0], before[1], before[4], before[5]].map((x) => x.delivery_date));
    await q(db, staff, "update public.subscriptions set paused_from = null, paused_until = null where id = $1", [sub]);
    expect((await deliveries(sub)).map((x) => x.delivery_date)).toEqual(before.map((x) => x.delivery_date));
  });

  it("is changed: the deliveries still open to change are made again", async () => {
    await q(db, staff, "update public.subscriptions set grams_per_day = 400 where id = $1", [sub]);
    const d = await deliveries(sub);
    expect(d.slice(0, 2).map((x) => x.grams)).toEqual([1250, 1750]);
  });

  it("is billed ahead for the week, as the deliveries come to; staff issue only that", async () => {
    const from = tuesday;
    const period = { subscription: sub, from, to: await addDays(from, 6) };
    const t = await foodBill(db, staff, k, period);
    expect(t.lines.map((l) => [l.quantity, l.unitPriceMinor])).toEqual([[3, 40000], [2, 5000]]);
    const wrong = billFor(org, [{ ...t.lines[0], quantity: 2 }, t.lines[1]]);
    expect((await errorOf(() => issueFoodBill(db, staff, k, period, wrong))).message).toContain("WB050");
    // The draft stays for a manager; take it away to issue the right one.
    await q(db, k.owner, "delete from public.invoices where subscription_id = $1 and status = 'draft'", [sub]);
    const bill = await issueFoodBill(db, staff, k, period, t);
    expect(bill).toBeTruthy();
    // A second bill for any of the same days is refused.
    const overlap = await fails(staff, "insert into public.invoices (org_id, client_id, subscription_id, period_start, period_end) values ($1, $2, $3, $4, ($4::date + 3))", [k.org, k.client, sub, await addDays(from, 2)]);
    expect(overlap.message).toContain("WB155");
    // A delivery of a subscription is never billed on its own.
    const [first] = await deliveries(sub);
    const alone = await fails(staff, "insert into public.invoices (org_id, client_id, delivery_id) values ($1, $2, $3)", [k.org, k.client, first.id]);
    expect(alone.message).toContain("WB154");
    // And a billed delivery is cancelled, never deleted.
    const gone = await fails(k.owner, "delete from public.deliveries where id = $1", [first.id]);
    expect(gone.message).toContain("WB152");
  });

  it("is credited for a billed delivery cancelled before it is cooked", async () => {
    const [first] = await deliveries(sub);
    await q(db, staff, "update public.deliveries set status = 'cancelled', cancel_reason = 'Away that week' where id = $1", [first.id]);
    const credit = await creditForChangeLines(db, manager, k, sub, tuesday);
    // The week now comes to the second delivery's 1.75 kg and its charge: 1.25 kg and a charge less.
    expect(credit).toBe(50000 + 5000);
  });

  it("is cancelled: nothing from that day on", async () => {
    const d = await deliveries(sub);
    await q(db, staff, "update public.subscriptions set cancelled_on = $2, cancel_reason = 'Moving away' where id = $1", [sub, d[2].delivery_date]);
    const left = await deliveries(sub);
    expect(left.every((x) => x.delivery_date < d[2].delivery_date)).toBe(true);
    const noReason = await fails(staff, "update public.subscriptions set cancel_reason = null where id = $1", [sub]);
    expect(noReason.message).toContain("subscriptions_cancel_has_reason");
  });
});

describe("the cut-off", () => {
  it("closes changes to a delivery being cooked; a manager cancels it with a reason", async () => {
    const today = await dayFromToday(db, k, 0);
    const [{ id }] = await q<{ id: string }>(
      db, staff,
      "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, grams, recipe_id) values ($1, 'order', $2, $3, $4, $5, 1000, $6) returning id",
      [k.org, k.client, k.pets[1], k.subscriptionFood, today, k.recipes[0]],
    );
    const change = await fails(staff, "update public.deliveries set grams = 2000 where id = $1", [id]);
    expect(change.message).toContain("WB151");
    const cancel = await fails(staff, "update public.deliveries set status = 'cancelled', cancel_reason = 'x' where id = $1", [id]);
    expect(cancel.message).toContain("WB151");
    const noReason = await fails(manager, "update public.deliveries set status = 'cancelled' where id = $1", [id]);
    expect(noReason.message).toContain("deliveries_cancel_has_reason");
    await q(db, manager, "update public.deliveries set status = 'cancelled', cancel_reason = 'Parent away' where id = $1", [id]);
    const back = await fails(manager, "update public.deliveries set status = 'planned', cancel_reason = null where id = $1", [id]);
    expect(back.message).toContain("WB153");
  });
});

describe("one-off orders", () => {
  it("give a pet its trial once, at the trial's price and weight, billed on its own", async () => {
    const day = await dayFromToday(db, k, 5);
    const [{ id, grams, price_minor }] = await q<{ id: string; grams: number; price_minor: string }>(
      db, staff,
      "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, address_id, recipe_id) values ($1, 'trial', $2, $3, $4, $5, $6, $7) returning id, grams, price_minor",
      [k.org, k.client, k.pets[2], k.trialFood, day, k.address, k.recipes[0]],
    );
    expect([grams, Number(price_minor)]).toEqual([1000, 49900]);
    const again = await fails(staff, "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date) values ($1, 'trial', $2, $3, $4, $5)", [k.org, k.client, k.pets[2], k.trialFood, day]);
    expect(again.message).toContain("deliveries_one_trial_per_pet");
    const t = await foodBill(db, staff, k, { delivery: id });
    expect(t.totalMinor).toBe(49900 + 5000);
    expect(await issueFoodBill(db, staff, k, { delivery: id }, t)).toBeTruthy();
  });

  it("price an item per piece, and refuse food sold another way", async () => {
    const day = await dayFromToday(db, k, 6);
    const [{ price_minor }] = await q<{ price_minor: string }>(
      db, staff,
      "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, quantity) values ($1, 'item', $2, $3, $4, $5, 2) returning price_minor",
      [k.org, k.client, k.pets[0], k.cake, day],
    );
    expect(Number(price_minor)).toBe(240000);
    const odd = await fails(staff, "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date) values ($1, 'item', $2, $3, $4, $5)", [k.org, k.client, k.pets[0], k.trialFood, day]);
    expect(odd.message).toContain("WB150");
  });
});

async function addDays(date: string, n: number): Promise<string> {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
