/**
 * Groundwork for more than boarding (M25, D44): weights in grams, PIN codes
 * and the areas a kennel serves, and which skills matter for what it offers.
 */

/** Grams, as the database keeps weights: 34.5 kg is 34500. */
export type Grams = number;

/** Heavier than any dog; the database refuses it too. */
export const MAX_WEIGHT_G = 199_999;

/**
 * A weight typed in kilos ("34.5", "34,5", "6.55 kg") as whole grams, or null
 * when it is not a weight. Up to three decimals, so grams can be typed exactly.
 */
export function parseKgToGrams(input: string): Grams | null {
  const text = input.trim().toLowerCase().replace(/\s*kgs?$/, "").replace(",", ".");
  const m = /^(\d{1,3})(?:\.(\d{1,3}))?$/.exec(text);
  if (!m) return null;
  const grams = Number(m[1]) * 1000 + Number((m[2] ?? "").padEnd(3, "0"));
  return grams >= 1 && grams <= MAX_WEIGHT_G ? grams : null;
}

/** Grams as kilos for reading: 34500 is "34.5", 6550 is "6.55", in the reader's locale. */
export function formatKg(grams: Grams, locale = "en-IN"): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(grams / 1000);
}

/** The change from one weight to the next, in grams; positive is a gain. */
export function weightChange(earlier: Grams, later: Grams): Grams {
  return later - earlier;
}

/**
 * A postal code as stored, or null. In India a PIN code is six digits that do
 * not start with 0 ("560 038" becomes "560038"). Elsewhere, 3 to 10 letters,
 * digits, spaces or hyphens with at least one digit, in capitals, as the
 * database allows.
 */
export function normalizePostalCode(input: string, country: string): string | null {
  const text = input.trim().toUpperCase().replace(/\s+/g, " ");
  if (country === "IN") {
    const digits = text.replace(/[\s-]/g, "");
    return /^[1-9]\d{5}$/.test(digits) ? digits : null;
  }
  return /^[A-Z0-9][A-Z0-9 -]{1,8}[A-Z0-9]$/.test(text) && /\d/.test(text) ? text : null;
}

export interface ServiceArea {
  postal_code: string;
  name: string;
  delivery_charge_minor: number | null;
}

/** The kennel's area for a postal code, or null when it does not deliver there. */
export function areaFor<A extends ServiceArea>(postalCode: string | null, areas: readonly A[]): A | null {
  if (!postalCode) return null;
  return areas.find((a) => a.postal_code === postalCode) ?? null;
}

/** A map link a parent shared, kept only when it is an https address. */
export function isMapLink(input: string): boolean {
  if (input.length > 500) return false;
  try {
    return new URL(input).protocol === "https:";
  } catch {
    return false;
  }
}

export const STAFF_SKILLS = ["cook", "groomer", "trainer", "swim_supervisor", "rider"] as const;
export type StaffSkill = (typeof STAFF_SKILLS)[number];

export interface Offers {
  offers_appointments: boolean;
  offers_kitchen: boolean;
  offers_food_delivery: boolean;
  offers_shop: boolean;
}

/** The skills worth asking about for what the kennel offers: a kennel with no kitchen has no cooks. */
export function skillsOffered(o: Offers): StaffSkill[] {
  return STAFF_SKILLS.filter(
    (s) =>
      (s === "cook" && o.offers_kitchen) ||
      (s === "rider" && o.offers_food_delivery) ||
      ((s === "groomer" || s === "trainer" || s === "swim_supervisor") && o.offers_appointments),
  );
}

/** Whether anything beyond boarding is switched on. */
export function offersMore(o: Offers): boolean {
  return o.offers_appointments || o.offers_kitchen || o.offers_food_delivery || o.offers_shop;
}
