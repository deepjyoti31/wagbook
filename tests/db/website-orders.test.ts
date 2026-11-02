import type { PGlite } from "@electric-sql/pglite";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addMember } from "./fixtures";
import { admin, anon, as, createTestDb, errorOf } from "./harness";
import { dayFromToday, q, seedKitchen, type Kitchen } from "./kitchen-fixtures";

/**
 * Roadmap M68: orders and booking requests from the kennel's own website.
 * Each area delivers on its own days; a made-to-order item (a birthday cake)
 * is ordered once, priced with the area's delivery charge and paid ahead; a
 * request the website sends again with the same reference is kept once; and
 * the kennel names the one website its forms may send from.
 */

let db: PGlite;
let k: Kitchen;
let staff: string;
let slug: string;

type Sent = { token: string; status: string; amount_minor: number | null; starts_on: string | null; kind: string; repeat?: boolean };

beforeAll(async () => {
  db = await createTestDb();
  k = await seedKitchen(db);
  staff = await addMember(db, k, "staff");
  [{ slug }] = await q<{ slug: string }>(db, k.owner, "select slug from public.organizations where id = $1", [k.org]);
  // Indiranagar has food on Monday and Thursday; Hebbal on Tuesday and Friday; nobody delivers on Sunday.
  await q(db, k.owner, "update public.service_areas set delivery_weekdays = '{1,4}' where org_id = $1", [k.org]);
  await q(db, k.owner, "insert into public.service_areas (org_id, postal_code, name, delivery_charge_minor, delivery_weekdays) values ($1, '560024', 'Hebbal', 6000, '{2,3,5,6}')", [k.org]);
});
afterAll(() => db.close());

const send = (payload: unknown) =>
  as(db, anon, async () => (await db.query<{ r: Sent }>("select public.submit_food_order($1, $2) as r", [slug, payload])).rows[0].r);

let phone = 9845100000;
const order = (over: Record<string, unknown> = {}) => ({
  kind: "subscription",
  parent_name: "Asha Rao",
  phone: `+91${++phone}`,
  pet_name: "Bruno",
  weight_g: 20000,
  grams_per_day: 500,
  weekdays: [2, 5],
  slot: "morning",
  line: "12 First Cross",
  postal_code: "560038",
  consent: true,
  consent_text: "I agree",
  ...over,
});

/** The kennel's first day, at least `ahead` days from today, that falls on the given weekday (1 Monday to 7 Sunday). */
async function nextWeekday(isodow: number, ahead = 2): Promise<string> {
  return as(db, admin, async () =>
    (await db.query<{ d: string }>(
      "select min(d)::date::text as d from generate_series(public.org_today($1) + $2::integer, public.org_today($1) + $2::integer + 6, interval '1 day') d where extract(isodow from d) = $3",
      [k.org, ahead, isodow],
    )).rows[0].d);
}
const isodow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;

describe("delivery days for each area", () => {
  it("are shown on the order page", async () => {
    const [{ f }] = await as(db, anon, async () => (await db.query<{ f: { areas: { postal_code: string; weekdays: number[] | null }[] } }>("select public.get_public_food_form($1) as f", [slug])).rows);
    expect(f.areas.map((a) => [a.postal_code, a.weekdays])).toEqual([["560024", [2, 3, 5, 6]], ["560038", [1, 4]]]);
  });

  it("decide a subscription's days, whatever the page asked for, and the price follows them", async () => {
    const r = await send(order({ weekdays: [2, 5] }));
    // Monday covers three days (1.5 kg) and Thursday four (2 kg) at ₹400 a kilo, with ₹50 delivery each time.
    expect([r.status, r.amount_minor]).toEqual(["unpaid", 60000 + 80000 + 2 * 5000]);
    expect([1, 4]).toContain(isodow(r.starts_on!));
    const [o] = await q<{ weekdays: number[] }>(db, staff, "select weekdays from public.food_orders where public_token = $1", [r.token]);
    expect(o.weekdays).toEqual([1, 4]);
  });

  it("put a trial on the area's next delivery day, from the day the parent asked for", async () => {
    const from = await dayFromToday(db, k, 9);
    const r = await send(order({ kind: "trial", postal_code: "560024", starts_on: from }));
    expect([2, 3, 5, 6]).toContain(isodow(r.starts_on!));
    expect(r.starts_on! >= from).toBe(true);
    expect(r.amount_minor).toBe(49900 + 6000);
  });

  it("let an area with no days set take the days the parent chose", async () => {
    await q(db, k.owner, "insert into public.service_areas (org_id, postal_code, name) values ($1, '560001', 'MG Road')", [k.org]);
    const r = await send(order({ postal_code: "560001", weekdays: [3, 6] }));
    expect([3, 6]).toContain(isodow(r.starts_on!));
    expect((await errorOf(() => send(order({ postal_code: "560001", weekdays: [] })))).message).toContain("WB185");
    await q(db, k.owner, "delete from public.service_areas where org_id = $1 and postal_code = '560001'", [k.org]);
  });

  it("keep a subscription from a PIN code not served on the waiting list, with no days to choose", async () => {
    const r = await send(order({ postal_code: "560100", weekdays: [] }));
    expect([r.status, r.amount_minor]).toEqual(["waiting_area", null]);
  });

  it("refuse a start day in the past or too far ahead", async () => {
    for (const starts_on of ["2020-01-01", await dayFromToday(db, k, 200), "not a day"]) {
      expect((await errorOf(() => send(order({ starts_on })))).message).toContain("WB187");
    }
  });

  it("are one to seven real weekdays", async () => {
    for (const days of ["{}", "{0}", "{8}"]) {
      const e = await errorOf(() => q(db, k.owner, "update public.service_areas set delivery_weekdays = $2 where org_id = $1", [k.org, days]));
      expect(e.message).toMatch(/check constraint/);
    }
  });
});

describe("a made-to-order item from outside", () => {
  const cake = async (over: Record<string, unknown> = {}) =>
    order({ kind: "item", weight_g: null, grams_per_day: null, weekdays: null, inscription: "Happy birthday Bruno", starts_on: await nextWeekday(3), slot: "afternoon", ...over });

  it("is offered on the order page with its price and notice", async () => {
    const [{ f }] = await as(db, anon, async () => (await db.query<{ f: { items: { id: string; name: string; price_minor: number }[]; item_lead_hours: number } }>("select public.get_public_food_form($1) as f", [slug])).rows);
    expect(f.items.map((i) => [i.id, i.name, Number(i.price_minor)])).toEqual([[k.cake, "Birthday cake", 120000]]);
    expect(f.item_lead_hours).toBe(24);
  });

  it("costs the item and the area's delivery charge, paid ahead, and becomes its delivery after Confirm", async () => {
    const r = await send(await cake({ postal_code: "560024", starts_on: await nextWeekday(5) }));
    expect([r.kind, r.status, r.amount_minor]).toEqual(["item", "unpaid", 120000 + 6000]);
    // The notice changes after the order was sent: the order already gave it, so Confirm still makes the delivery.
    await q(db, k.owner, "update public.organizations set item_lead_hours = 336 where id = $1", [k.org]);
    const [{ id }] = await q<{ id: string }>(db, staff, "select id from public.food_orders where public_token = $1", [r.token]);
    const [{ client }] = await q<{ client: string }>(db, staff, "select public.confirm_food_order($1) as client", [id]);
    const [d] = await q<{ kind: string; delivery_date: string; slot: string; inscription: string; price_minor: string; delivery_charge_minor: string }>(
      db, staff, "select kind, delivery_date::text, slot, inscription, price_minor::text, delivery_charge_minor::text from public.deliveries where client_id = $1", [client],
    );
    expect(d).toEqual({ kind: "item", delivery_date: r.starts_on, slot: "afternoon", inscription: "Happy birthday Bruno", price_minor: "120000", delivery_charge_minor: "6000" });
    const [o] = await q<{ delivery_id: string; status: string }>(db, staff, "select delivery_id, status from public.food_orders where id = $1", [id]);
    expect(o.status).toBe("confirmed");
    expect(o.delivery_id).not.toBeNull();
    // A cake does not put the dog on the kitchen's food, and gives no weighing.
    expect(await q(db, staff, "select 1 from public.pet_food f join public.pets p on p.id = f.pet_id where p.client_id = $1", [client])).toHaveLength(0);
    expect(await q(db, staff, "select 1 from public.pet_weights w join public.pets p on p.id = w.pet_id where p.client_id = $1", [client])).toHaveLength(0);
    // Staff making one by hand for that day are still held to the notice.
    const byHand = await errorOf(() =>
      q(db, staff, "insert into public.deliveries (org_id, kind, client_id, pet_id, product_id, delivery_date, slot, address_id) values ($1, 'item', $2, $3, $4, $5, 'afternoon', $6)", [
        k.org, k.client, k.pets[0], k.cake, r.starts_on, k.address,
      ]));
    expect(byHand.message).toContain("WB156");
    await q(db, k.owner, "update public.organizations set item_lead_hours = 24 where id = $1", [k.org]);
  });

  it("needs a day, the notice, and a day some area takes deliveries", async () => {
    expect((await errorOf(async () => send(await cake({ starts_on: null })))).message).toContain("WB189");
    expect((await errorOf(async () => send(await cake({ starts_on: await dayFromToday(db, k, 0), slot: "morning" })))).message).toContain("WB156");
    expect((await errorOf(async () => send(await cake({ starts_on: await nextWeekday(7) })))).message).toContain("WB300");
    // Hebbal's Wednesday is open for a cake to Indiranagar too: the days are the kitchen's, not the area's.
    expect((await send(await cake())).status).toBe("unpaid");
    expect((await errorOf(async () => send(await cake({ product_id: k.trialFood })))).message).toContain("WB180");
  });

  it("waits for its area when the PIN code is not served, with nothing to pay", async () => {
    const r = await send(await cake({ postal_code: "560100" }));
    expect([r.status, r.amount_minor]).toEqual(["waiting_area", null]);
  });
});

describe("a request the website sends again", () => {
  it("is one food order, answered as the first time; another phone with the same number is its own", async () => {
    const first = order({ site_ref: "WEB-261025-7KQ2", site_source: "instagram / launch" });
    const a = await send(first);
    const b = await send(first);
    expect(b).toEqual({ ...a, repeat: true });
    const other = await send({ ...first, phone: "+919845199999" });
    expect(other.token).not.toBe(a.token);
    const kept = await q<{ phone: string; site_source: string }>(db, staff, "select phone, site_source from public.food_orders where site_ref = 'WEB-261025-7KQ2' order by phone", []);
    expect(kept).toHaveLength(2);
    expect(kept[0].site_source).toBe("instagram / launch");
  });

  it("is one booking request", async () => {
    const intake = (ref: string) => ({ v: 1, parent: { name: "Meera Shah", phone: "+919811122233" }, pets: [{ name: "Simba" }], stay: {}, site: { ref }, consent: true });
    const submit = (payload: unknown) => as(db, anon, async () => (await db.query<{ r: Record<string, unknown> }>("select public.submit_intake($1, $2::jsonb) as r", [slug, JSON.stringify(payload)])).rows[0].r);
    expect(await submit(intake("WEB-261025-AB23"))).toHaveProperty("upload_token");
    expect(await submit(intake("WEB-261025-AB23"))).toEqual({ repeat: true });
    expect(await submit(intake("<script>"))).toHaveProperty("upload_token");
    const kept = await q<{ site_ref: string | null }>(db, staff, "select site_ref from public.intake_submissions where org_id = $1 and parent_phone = '+919811122233' order by created_at", [k.org]);
    expect(kept).toEqual([{ site_ref: "WEB-261025-AB23" }, { site_ref: null }]);
  });
});

describe("the kennel's own website", () => {
  it("is an address with nothing after it, given to the public forms", async () => {
    for (const ok of ["https://example.com", "https://www.example.co.in", "https://shop.example.com:8443", "http://localhost:8080", null]) {
      await q(db, k.owner, "update public.organizations set website_url = $2 where id = $1", [k.org, ok]);
    }
    for (const bad of ["https://example.com/", "https://example.com/book", "http://example.com", "javascript:alert(1)", "https://EXAMPLE.com", "https://example"]) {
      const e = await errorOf(() => q(db, k.owner, "update public.organizations set website_url = $2 where id = $1", [k.org, bad]));
      expect(e.message, bad).toContain("organizations_website_is_origin");
    }
    await q(db, k.owner, "update public.organizations set website_url = 'https://example.com' where id = $1", [k.org]);
    const [{ f }] = await as(db, anon, async () => (await db.query<{ f: { kennel: { website: string } } }>("select public.get_public_food_form($1) as f", [slug])).rows);
    const [{ i }] = await as(db, anon, async () => (await db.query<{ i: { website: string } }>("select public.get_public_intake_form($1) as i", [slug])).rows);
    expect([f.kennel.website, i.website]).toEqual(["https://example.com", "https://example.com"]);
  });
});
