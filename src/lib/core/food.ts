/**
 * The kitchen and food (Phase 1, M26 to M33, D44): stock left by use-by
 * date, portions, packs, when changes close, the rotation, the cook plan and
 * the shopping list. Grams, millilitres, pieces and paise, never decimals.
 */

import { addDays, diffDays, type ISODate } from "./dates";
import { roundHalfUp } from "./money";

// ---------------------------------------------------------------------------
// Stock (M26)
// ---------------------------------------------------------------------------

export interface StockMove {
  kind: "purchase" | "used" | "waste" | "count";
  quantity: number;
  happened_on: ISODate;
  use_by: ISODate | null;
}

export interface StockLot {
  /** When it came in. */
  in_on: ISODate;
  use_by: ISODate | null;
  left: number;
}

/**
 * What is left of each purchase, oldest use-by first, when everything that
 * went out came out of the soonest to go off. Stock that a stock take found
 * over what the movements said counts as a lot with no use-by date.
 */
export function lotsLeft(moves: readonly StockMove[]): StockLot[] {
  const lots: StockLot[] = moves
    .filter((m) => m.quantity > 0)
    .map((m) => ({ in_on: m.happened_on, use_by: m.kind === "purchase" ? m.use_by : null, left: m.quantity }))
    .sort((a, b) => (a.use_by ?? "9999-12-31").localeCompare(b.use_by ?? "9999-12-31") || a.in_on.localeCompare(b.in_on));
  let out = moves.filter((m) => m.quantity < 0).reduce((a, m) => a - m.quantity, 0);
  for (const lot of lots) {
    const take = Math.min(lot.left, out);
    lot.left -= take;
    out -= take;
  }
  return lots.filter((l) => l.left > 0);
}

/** Lots that pass their use-by date within `days` days of today (or already have), soonest first. */
export function usingSoon(lots: readonly StockLot[], today: ISODate, days = 2): StockLot[] {
  return lots.filter((l) => l.use_by !== null && diffDays(today, l.use_by) <= days);
}

/** Whether an item is at or below its low level. */
export function isLow(onHand: number, lowLevel: number | null): boolean {
  return lowLevel !== null && onHand <= lowLevel;
}

/**
 * A quantity typed in an item's unit, as a whole number of grams,
 * millilitres or pieces. Kilos and litres may be typed for grams and
 * millilitres ("2.5 kg", "750 g", "1,5 l"); a bare number is the unit itself.
 */
export function parseQuantity(input: string, unit: "g" | "ml" | "piece"): number | null {
  const text = input.trim().toLowerCase().replace(",", ".").replace(/\s+/g, "");
  const m = /^(\d{1,7}(?:\.\d{1,3})?)(kg|g|l|ml|pcs?|pieces?)?$/.exec(text);
  if (!m) return null;
  const n = Number(m[1]);
  const suffix = m[2] ?? "";
  let value: number;
  if (unit === "g" && suffix === "kg") value = n * 1000;
  else if (unit === "ml" && suffix === "l") value = n * 1000;
  else if ((unit === "g" && (suffix === "" || suffix === "g")) || (unit === "ml" && (suffix === "" || suffix === "ml"))) value = n;
  else if (unit === "piece" && (suffix === "" || suffix.startsWith("pc") || suffix.startsWith("piece"))) value = n;
  else return null;
  const whole = Math.round(value);
  return Math.abs(value - whole) < 1e-9 && whole > 0 && whole <= 10_000_000 ? whole : null;
}

// ---------------------------------------------------------------------------
// Portions (M28)
// ---------------------------------------------------------------------------

export interface PortionSettings {
  portion_small_bp: number;
  portion_medium_bp: number;
  portion_large_bp: number;
  small_dog_max_g: number;
  medium_dog_max_g: number;
  topper_share_bp: number;
  goal_change_bp: number;
}

export const DEFAULT_PORTIONS: PortionSettings = {
  portion_small_bp: 300,
  portion_medium_bp: 250,
  portion_large_bp: 200,
  small_dog_max_g: 10_000,
  medium_dog_max_g: 25_000,
  topper_share_bp: 3333,
  goal_change_bp: 1000,
};

export type SizeBand = "small" | "medium" | "large";
export type FoodPlan = "full" | "topper";
export type FoodGoal = "lose" | "keep" | "gain";

/** A dog's size for portions, from its weight. */
export function sizeBand(weightG: number, s: PortionSettings): SizeBand {
  if (weightG <= s.small_dog_max_g) return "small";
  if (weightG <= s.medium_dog_max_g) return "medium";
  return "large";
}

/**
 * Grams of food a day: the dog's weight times its band's share (3%, 2.5% or
 * 2% by default), less 10% to lose weight or more 10% to gain it, and a
 * third of that on a topper plan. Each step rounds to the nearest gram.
 * A 20 kg dog keeping its weight eats 500 g a day on a full meal and 167 g
 * as a topper (the worked example in 02, F5).
 */
export function portionGrams(i: { weightG: number; plan: FoodPlan; goal: FoodGoal }, s: PortionSettings): number {
  const band = sizeBand(i.weightG, s);
  const share = band === "small" ? s.portion_small_bp : band === "medium" ? s.portion_medium_bp : s.portion_large_bp;
  let grams = roundHalfUp((i.weightG * share) / 10_000);
  if (i.goal === "lose") grams = roundHalfUp((grams * (10_000 - s.goal_change_bp)) / 10_000);
  if (i.goal === "gain") grams = roundHalfUp((grams * (10_000 + s.goal_change_bp)) / 10_000);
  if (i.plan === "topper") grams = roundHalfUp((grams * s.topper_share_bp) / 10_000);
  return grams;
}

/** The grams a pet eats a day: set by hand when a manager did, otherwise worked out; null with no weight. */
export function dailyGrams(
  pet: { weight_g: number | null },
  food: { plan: FoodPlan; goal: FoodGoal; grams_by_hand: number | null } | null,
  s: PortionSettings,
): number | null {
  if (food?.grams_by_hand) return food.grams_by_hand;
  if (!pet.weight_g) return null;
  return portionGrams({ weightG: pet.weight_g, plan: food?.plan ?? "full", goal: food?.goal ?? "keep" }, s);
}

/** Pets whose portion is due a look: on the kitchen's food a week or more, and not looked at since. */
export function portionReviewDue(f: { started_on: ISODate | null; reviewed_on: ISODate | null }, today: ISODate, afterDays = 7): boolean {
  if (!f.started_on) return false;
  if (diffDays(f.started_on, today) < afterDays) return false;
  return f.reviewed_on === null || f.reviewed_on < addDays(f.started_on, afterDays);
}

// ---------------------------------------------------------------------------
// Subscriptions and deliveries (M29)
// ---------------------------------------------------------------------------

export const DELIVERY_SLOTS = ["morning", "afternoon", "evening"] as const;
export type DeliverySlot = (typeof DELIVERY_SLOTS)[number];

/** When each slot starts, kennel time. Must match delivery_cutoff() in the database. */
export const SLOT_STARTS: Record<DeliverySlot, string> = { morning: "08:00", afternoon: "13:00", evening: "18:00" };

/** ISO weekday of a date: 1 Monday to 7 Sunday. */
export function isoWeekday(date: ISODate): number {
  const d = new Date(`${date}T00:00:00Z`).getUTCDay();
  return d === 0 ? 7 : d;
}

/** Days a delivery on `weekday` covers: until the next of the delivery days, 7 when it is the only one. Must match plan_subscription(). */
export function coversDays(weekdays: readonly number[], weekday: number): number {
  return Math.min(...weekdays.map((w) => ((w - weekday + 6) % 7) + 1));
}

/** Grams for so many days, rounded up to whole packs. Must match plan_subscription(). */
export function packedGrams(gramsPerDay: number, days: number, packG: number): number {
  return Math.ceil((gramsPerDay * days) / packG) * packG;
}

/** The delivery days of a subscription from `from` to `to` (inclusive), with what each covers and its grams. */
export function deliveryDays(
  sub: { weekdays: readonly number[]; grams_per_day: number },
  from: ISODate,
  to: ISODate,
  packG: number,
): { date: ISODate; covers: number; grams: number }[] {
  const out: { date: ISODate; covers: number; grams: number }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const w = isoWeekday(d);
    if (!sub.weekdays.includes(w)) continue;
    const covers = coversDays(sub.weekdays, w);
    out.push({ date: d, covers, grams: packedGrams(sub.grams_per_day, covers, packG) });
  }
  return out;
}

/** What so many grams cost at a price per kilo. Must match deliveries_price() in the database. */
export function priceForGrams(grams: number, perKgMinor: number): number {
  return roundHalfUp((grams * perKgMinor) / 1000);
}

/** The UTC instant of a kennel-local date and time in an IANA time zone. */
export function zonedInstant(date: ISODate, time: string, timeZone: string): Date {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const guess = Date.UTC(y, mo - 1, d, h, mi);
  // The zone's offset at that moment, read back through Intl; twice for the day a clock changes.
  let t = guess;
  for (let i = 0; i < 2; i++) {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(new Date(t));
    const n = (type: string) => Number(parts.find((p) => p.type === type)!.value);
    const local = Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"));
    t = guess - (local - t);
  }
  return new Date(t);
}

/** When changes to a delivery close: its slot's start less the kennel's cut-off hours. Must match delivery_cutoff(). */
export function deliveryCutoff(date: ISODate, slot: DeliverySlot, timeZone: string, cutoffHours: number): Date {
  return new Date(zonedInstant(date, SLOT_STARTS[slot], timeZone).getTime() - cutoffHours * 3_600_000);
}

/** The Monday of the week a date is in: a subscription paid weekly is billed Monday to Sunday. */
export function weekStart(date: ISODate): ISODate {
  return addDays(date, 1 - isoWeekday(date));
}

/** The period a bill starting on `start` covers: a week, or the calendar month. */
export function billPeriod(start: ISODate, period: "week" | "month"): { from: ISODate; to: ISODate } {
  if (period === "week") {
    const from = weekStart(start);
    return { from, to: addDays(from, 6) };
  }
  const from = `${start.slice(0, 7)}-01`;
  const [y, m] = from.split("-").map(Number);
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { from, to: addDays(next, -1) };
}

/** Trials handed over between `minDays` and `maxDays` ago, whose parents have not been asked about a subscription. */
export function trialsToFollowUp<T extends { delivery_date: ISODate; status: string; client_id: string }>(
  trials: readonly T[],
  subscribedClients: ReadonlySet<string>,
  asked: ReadonlySet<string>,
  today: ISODate,
  minDays = 3,
  maxDays = 14,
): T[] {
  return trials.filter((t) => {
    if (t.status !== "delivered" || subscribedClients.has(t.client_id) || asked.has(t.client_id)) return false;
    const ago = diffDays(t.delivery_date, today);
    return ago >= minDays && ago <= maxDays;
  });
}

// ---------------------------------------------------------------------------
// The rotation, the cook plan and the shopping list (M27, M30)
// ---------------------------------------------------------------------------

/** The rotation's days: four recipes and two deliveries a week repeat every two weeks. */
export const ROTATION_DAYS = 14;
const ROTATION_EPOCH: ISODate = "2026-01-05";

/**
 * The place in the rotation of the recipe boarders eat on a day: the
 * rotation's recipes share its 14 days in turn (four recipes, three or four
 * days each), the same for everyone, so the kitchen cooks one recipe a day
 * for its boarders.
 */
export function boarderRecipeIndex(date: ISODate, recipes: number): number {
  if (recipes <= 0) return -1;
  const day = ((diffDays(ROTATION_EPOCH, date) % ROTATION_DAYS) + ROTATION_DAYS) % ROTATION_DAYS;
  return Math.floor((day * recipes) / ROTATION_DAYS);
}

export interface CookLine {
  recipe_id: string;
  /** Grams for deliveries. */
  deliveries: number;
  /** Grams for boarders. */
  boarders: number;
  /** Deliveries and boarders together, with the margin, rounded up to 100 g. */
  cook: number;
}

/**
 * What to cook for a day: for each recipe, the grams its deliveries need and
 * the boarders' grams a day, plus the kennel's margin, rounded up to the next
 * 100 grams. Recipes in the order first met.
 */
export function cookPlan(
  deliveries: readonly { recipe_id: string | null; grams: number }[],
  boarders: readonly { recipe_id: string | null; grams: number }[],
  marginBp: number,
): CookLine[] {
  const lines = new Map<string, CookLine>();
  const add = (recipe: string | null, grams: number, part: "deliveries" | "boarders") => {
    if (!recipe || grams <= 0) return;
    const line = lines.get(recipe) ?? { recipe_id: recipe, deliveries: 0, boarders: 0, cook: 0 };
    line[part] += grams;
    lines.set(recipe, line);
  };
  for (const d of deliveries) add(d.recipe_id, d.grams, "deliveries");
  for (const b of boarders) add(b.recipe_id, b.grams, "boarders");
  return [...lines.values()].map((l) => ({ ...l, cook: Math.ceil(((l.deliveries + l.boarders) * (10_000 + marginBp)) / 10_000 / 100) * 100 }));
}

export interface ShoppingLine {
  item_id: string;
  name: string;
  unit: "g" | "ml" | "piece";
  supplier_id: string | null;
  need: number;
  have: number;
  /** Still to come on orders to suppliers (M63). */
  ordered: number;
  buy: number;
}

/**
 * What to buy for a cook plan: each ingredient's quantity per kilo times the
 * kilos to cook, added up over the recipes, less what is in stock and what is
 * still to come on orders to suppliers (M63). Only what is short is listed,
 * grouped by supplier (no supplier last), by name.
 */
export function shoppingList(
  plan: readonly { version_id: string; grams: number }[],
  ingredients: readonly { version_id: string; item_id: string; quantity_per_kg: number }[],
  items: readonly { item_id: string; name: string; unit: "g" | "ml" | "piece"; supplier_id: string | null; on_hand: number; on_order?: number }[],
): ShoppingLine[] {
  const need = new Map<string, number>();
  for (const p of plan) {
    for (const i of ingredients.filter((x) => x.version_id === p.version_id)) {
      need.set(i.item_id, (need.get(i.item_id) ?? 0) + Math.max(roundHalfUp((i.quantity_per_kg * p.grams) / 1000), 1));
    }
  }
  return [...need.entries()]
    .map(([id, n]) => {
      const item = items.find((i) => i.item_id === id);
      const have = Math.max(item?.on_hand ?? 0, 0);
      const ordered = Math.max(item?.on_order ?? 0, 0);
      return { item_id: id, name: item?.name ?? "", unit: item?.unit ?? "g", supplier_id: item?.supplier_id ?? null, need: n, have, ordered, buy: Math.max(n - have - ordered, 0) };
    })
    .filter((l) => l.buy > 0)
    .sort((a, b) => Number(a.supplier_id === null) - Number(b.supplier_id === null) || (a.supplier_id ?? "").localeCompare(b.supplier_id ?? "") || a.name.localeCompare(b.name));
}

/** A quantity of an item for reading: 2500 g is "2.5 kg", 750 ml is "750 ml", 12 pieces is "12". */
export function formatQuantity(n: number, unit: "g" | "ml" | "piece", locale = "en-IN"): string {
  const f = (x: number) => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(x);
  if (unit === "g") return n >= 1000 || n <= -1000 ? `${f(n / 1000)} kg` : `${f(n)} g`;
  if (unit === "ml") return n >= 1000 || n <= -1000 ? `${f(n / 1000)} l` : `${f(n)} ml`;
  return f(n);
}
