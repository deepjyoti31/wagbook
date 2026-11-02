import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember } from "./fixtures";
import { admin, anon, as, createTestDb, errorOf } from "./harness";
import { dayFromToday, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Roadmap M32: ordering food from the kennel's website. An order from a
 * private window becomes a subscription after Confirm; a PIN code not served
 * waits for its area with nothing charged; hostile input is refused; a known
 * parent pauses, skips or orders more from their own link.
 */

let db: PGlite;
let k: Kitchen;
let staff: string;
let slug: string;

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKitchen(db);
  staff = await addMember(db, k, "staff");
  [{ slug }] = await q<{ slug: string }>(db, k.owner, "select slug from public.organizations where id = $1", [k.org]);
});
afterAll(() => db.close());

const send = (payload: unknown, s = slug) =>
  as(db, anon, async () => (await db.query<{ r: { token: string; status: string; amount_minor: number | null; starts_on: string } }>("select public.submit_food_order($1, $2) as r", [s, payload])).rows[0].r);

const order = (over: Record<string, unknown> = {}) => ({
  kind: "subscription",
  parent_name: "Asha Rao",
  phone: "+919845012345",
  pet_name: "Bruno",
  weight_g: 20000,
  plan: "full",
  grams_per_day: 500,
  weekdays: [2, 5],
  slot: "morning",
  line: "12 First Cross",
  area: "Indiranagar",
  postal_code: "560038",
  consent: true,
  consent_text: "I agree",
  ...over,
});

describe("the food order page", () => {
  it("shows the kennel's food, portions and areas, only while it takes orders", async () => {
    const [{ f }] = await as(db, anon, async () => (await db.query<{ f: { subscription: { price_per_kg_minor: number }; areas: unknown[]; pack_g: number } }>("select public.get_public_food_form($1) as f", [slug])).rows);
    expect(f.subscription.price_per_kg_minor).toBe(40000);
    expect(f.areas).toEqual([{ postal_code: "560038", name: "Indiranagar", charge_minor: 5000, weekdays: null }]);
    expect(f.pack_g).toBe(250);
    const other = await (async () => {
      const o = await seedKitchen(db);
      await q(db, o.owner, "update public.organizations set food_orders_enabled = false where id = $1", [o.org]);
      const [{ s }] = await q<{ s: string }>(db, o.owner, "select slug as s from public.organizations where id = $1", [o.org]);
      return as(db, anon, async () => (await db.query<{ f: unknown }>("select public.get_public_food_form($1) as f", [s])).rows[0].f);
    })();
    expect(other).toBeNull();
  });

  it("prices the first week ahead itself, and becomes a subscription after Confirm", async () => {
    const r = await send(order({ amount_minor: 1 }));
    // Tuesday 1.5 kg and Friday 2 kg at ₹400 a kilo, and ₹50 delivery each time.
    expect([r.status, r.amount_minor]).toEqual(["unpaid", 60000 + 80000 + 2 * 5000]);
    const paid = await as(db, anon, async () => (await db.query<{ s: string }>("select public.food_order_paid($1) as s", [r.token])).rows[0].s);
    expect(paid).toBe("paid");
    const [{ id }] = await q<{ id: string }>(db, staff, "select id from public.food_orders where org_id = $1 and status = 'paid'", [k.org]);
    const [{ client }] = await q<{ client: string }>(db, staff, "select public.confirm_food_order($1) as client", [id]);
    const [sub] = await q<{ grams_per_day: number; weekdays: number[]; source: string; pet: string }>(
      db, staff,
      "select s.grams_per_day, s.weekdays, s.source, p.name as pet from public.subscriptions s join public.pets p on p.id = s.pet_id where s.client_id = $1",
      [client],
    );
    expect(sub).toEqual({ grams_per_day: 500, weekdays: [2, 5], source: "website", pet: "Bruno" });
    const [{ weight_g }] = await q<{ weight_g: number }>(db, staff, "select weight_g from public.pets where client_id = $1", [client]);
    expect(weight_g).toBe(20000);
    expect((await q(db, staff, "select id from public.deliveries where client_id = $1", [client])).length).toBeGreaterThanOrEqual(4);
    const twice = await errorOf(() => q(db, staff, "select public.confirm_food_order($1)", [id]));
    expect(twice.message).toContain("WB188");
  });

  it("dates the weight the parent gave by the kennel's own calendar", async () => {
    const r = await send(order({ phone: "+919845011111", pet_name: "Kaju" }));
    // Sent at half past one in the night in India: still the evening before in UTC.
    await as(db, admin, () => db.query("update public.food_orders set created_at = '2027-03-01 20:00:00+00' where public_token = $1", [r.token]));
    const [{ id }] = await q<{ id: string }>(db, staff, "select id from public.food_orders where public_token = $1", [r.token]);
    const [{ client }] = await q<{ client: string }>(db, staff, "select public.confirm_food_order($1) as client", [id]);
    const weighed = await q<{ weighed_on: string }>(db, staff, "select w.weighed_on::text from public.pet_weights w join public.pets p on p.id = w.pet_id where p.client_id = $1", [client]);
    expect(weighed).toEqual([{ weighed_on: "2027-03-02" }]);
  });

  it("keeps a PIN code it does not serve waiting for its area, with nothing to pay", async () => {
    const r = await send(order({ phone: "+919845099999", postal_code: "560100" }));
    expect([r.status, r.amount_minor]).toEqual(["waiting_area", null]);
  });

  it("refuses hostile input", async () => {
    const tries: [unknown, string][] = [
      [null, "WB181"],
      ["\"not an object\"", "WB181"],
      [order({ kind: "pause" }), "WB181"],
      [order({ padding: "x".repeat(9000) }), "WB181"],
      [order({ phone: "12345" }), "WB182"],
      [order({ consent: false }), "WB182"],
      [order({ postal_code: "<script>" }), "WB182"],
      [order({ postal_code: "012345" }), "WB182"],
      [order({ weight_g: "20 kg" }), "WB183"],
      [order({ weight_g: 1 }), "WB183"],
      [order({ weekdays: [9] }), "WB185"],
      [order({ grams_per_day: 99999 }), "WB185"],
      [order({ grams_per_day: "500; drop table pets" }), "WB185"],
    ];
    for (const [payload, code] of tries) {
      expect((await errorOf(() => send(payload))).message, JSON.stringify(payload).slice(0, 80)).toContain(code);
    }
    expect((await errorOf(() => send(order(), "no-such-kennel"))).message).toContain("WB180");
    // A flood from one phone stops at three a day.
    for (let i = 0; i < 2; i++) await send(order({ phone: "+919845077777", postal_code: "560100" }));
    await send(order({ phone: "+919845077777", postal_code: "560100" }));
    expect((await errorOf(() => send(order({ phone: "+919845077777" })))).message).toContain("WB184");
  });

  it("never lets the anonymous role read an order back", async () => {
    const e = await errorOf(() => as(db, anon, () => db.query("select * from public.food_orders")));
    expect(e.message).toMatch(/permission denied/);
  });
});

describe("a known parent's own link", () => {
  it("asks to pause, skip or order more; staff confirm and the subscription follows", async () => {
    const [{ token }] = await q<{ token: string }>(db, staff, "select public.renew_request_link($1) as token", [k.client]);
    const [{ id: sub }] = await q<{ id: string }>(
      db, staff,
      "insert into public.subscriptions (org_id, client_id, pet_id, product_id, grams_per_day, weekdays, address_id, starts_on) values ($1, $2, $3, $4, 400, '{1,2,3,4,5,6,7}', $5, $6) returning id",
      [k.org, k.client, k.pets[0], k.subscriptionFood, k.address, await dayFromToday(db, k, 3)],
    );
    await q(db, staff, "select public.plan_subscription($1, $2)", [sub, await dayFromToday(db, k, 12)]);
    const [{ form }] = await as(db, anon, async () => (await db.query<{ form: { food: { id: string; next: { date: string }[] }[] } }>("select public.get_public_booking_form($1) as form", [token])).rows);
    expect(form.food.map((f) => f.id)).toEqual([sub]);
    const days = form.food[0].next.map((n) => n.date);

    const ask = (payload: unknown) => as(db, anon, () => db.query("select public.submit_food_request($1, $2)", [token, payload]));
    await ask({ kind: "pause", subscription_id: sub, from: days[2], until: days[3] });
    await ask({ kind: "skip", subscription_id: sub, from: days[0] });
    const strangers = await seedKitchen(db);
    const theirs = await errorOf(() => ask({ kind: "skip", subscription_id: strangers.client, from: days[0] }));
    expect(theirs.message).toContain("WB186");
    const past = await errorOf(() => ask({ kind: "pause", subscription_id: sub, from: "2020-01-01" }));
    expect(past.message).toContain("WB187");

    const asked = await q<{ id: string }>(db, staff, "select id from public.food_orders where subscription_id = $1 and status = 'requested' order by created_at", [sub]);
    for (const a of asked) await q(db, staff, "select public.confirm_food_order($1)", [a.id]);
    const left = await q<{ delivery_date: string }>(db, staff, "select delivery_date::text from public.deliveries where subscription_id = $1 and status <> 'cancelled' order by delivery_date", [sub]);
    const dates = left.map((l) => l.delivery_date);
    expect(dates).not.toContain(days[0]);
    expect(dates).not.toContain(days[2]);
    expect(dates).not.toContain(days[3]);
    expect(dates).toContain(days[1]);
  });
});

describe("erasing a parent who had food", () => {
  it("is refused while food is still to come, then removes their food orders, addresses and the subscription's notes", async () => {
    const e = await seedKitchen(db);
    const [{ id: sub }] = await q<{ id: string }>(
      db, e.owner,
      "insert into public.subscriptions (org_id, client_id, pet_id, product_id, grams_per_day, weekdays, address_id, starts_on, notes) values ($1, $2, $3, $4, 400, '{2,5}', $5, $6, 'Gate code 1234') returning id",
      [e.org, e.client, e.pets[0], e.subscriptionFood, e.address, await dayFromToday(db, e, 3)],
    );
    await q(db, e.owner, "select public.plan_subscription($1, $2)", [sub, await dayFromToday(db, e, 10)]);
    const [{ phone }] = await q<{ phone: string }>(db, e.owner, "select phone from public.clients where id = $1", [e.client]);
    const [{ slug: theirSlug }] = await q<{ slug: string }>(db, e.owner, "select slug from public.organizations where id = $1", [e.org]);
    await as(db, anon, () => db.query("select public.submit_food_order($1, $2)", [theirSlug, order({ phone })]));

    const refused = await errorOf(() => q(db, e.owner, "select public.erase_client($1)", [e.client]));
    expect(refused.message).toContain("WB075");

    await q(db, e.owner, "update public.subscriptions set cancelled_on = $2, cancel_reason = 'Moving away' where id = $1", [sub, await dayFromToday(db, e, 0)]);
    await q(db, e.owner, "select public.erase_client($1)", [e.client]);
    expect(await q(db, e.owner, "select id from public.food_orders where org_id = $1", [e.org])).toHaveLength(0);
    const [s] = await q<{ notes: string | null; cancel_reason: string }>(db, e.owner, "select notes, cancel_reason from public.subscriptions where id = $1", [sub]);
    expect(s).toEqual({ notes: null, cancel_reason: "Erased" });
    expect(await q(db, e.owner, "select id from public.client_addresses where client_id = $1", [e.client])).toHaveLength(0);
  });

  it("erases a parent whose food went out before, each delivery keeping what it cost", async () => {
    const e = await seedKitchen(db);
    await q(
      db, e.owner,
      "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, grams, recipe_id, address_id) values ($1, 'order', $2, $3, $4, $5, 1000, $6, $7)",
      [e.org, e.client, e.pets[0], e.subscriptionFood, await dayFromToday(db, e, -7), e.recipes[0], e.address],
    );
    // Its address goes with the parent, though the delivery is long past its cut-off.
    await q(db, e.owner, "select public.erase_client($1)", [e.client]);
    const [d] = await q<{ address_id: string | null; delivery_charge_minor: string }>(db, e.owner, "select address_id, delivery_charge_minor from public.deliveries where client_id = $1", [e.client]);
    expect([d.address_id, Number(d.delivery_charge_minor)]).toEqual([null, 5000]);
  });
});
