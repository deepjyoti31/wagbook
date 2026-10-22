import { addDays, formatQuantity, todayIn, type PortionSettings } from "./core";
import type { Messages } from "@/messages";
import type { Tables } from "./supabase/database.types";
import type { createClient } from "./supabase/server";

/**
 * Shared by the kitchen and food screens (M26 to M33). Kept out of the
 * "use server" files, which may export only async functions.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const STOCK_UNITS = ["g", "ml", "piece"] as const;
export const STOCK_KINDS = ["meat", "organ", "egg", "grain", "vegetable", "oil", "supplement", "packaging", "fuel", "grooming", "medicine", "other"] as const;
export const WASTE_REASONS = ["spoiled", "past_date", "dropped", "other"] as const;
export const WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export const FOOD_PRODUCT_KINDS = ["trial", "subscription", "by_kilo", "item"] as const;
export const PROBLEM_KINDS = ["damaged", "late", "wrong"] as const;
export const CUSTOMER_SOURCES = ["boarding", "referral", "website", "other"] as const;

/** How far ahead subscriptions' deliveries are made each time the food screens open. */
export const PLAN_AHEAD_DAYS = 21;

/** The kennel's portion settings, as portionGrams() takes them. */
export function portionSettings(org: Tables<"organizations">): PortionSettings {
  return {
    portion_small_bp: org.portion_small_bp,
    portion_medium_bp: org.portion_medium_bp,
    portion_large_bp: org.portion_large_bp,
    small_dog_max_g: org.small_dog_max_g,
    medium_dog_max_g: org.medium_dog_max_g,
    topper_share_bp: org.topper_share_bp,
    goal_change_bp: org.goal_change_bp,
  };
}

/** Delivery days for reading: "Tue, Fri". */
export function weekdayList(m: Messages, days: readonly number[]): string {
  return [...days].sort((a, b) => a - b).map((d) => m.weekdays[d as keyof Messages["weekdays"]]).join(", ");
}

/** A quantity in an item's unit, for reading in the reader's locale. */
export function quantityText(n: number, unit: string, locale: string): string {
  return formatQuantity(n, unit === "ml" || unit === "piece" ? unit : "g", locale);
}

/** A basis-point share as a percent for reading or typing: 250 is "2.5". */
export function percentText(bp: number): string {
  return String(bp / 100);
}

/** A percent typed by a person ("2.5", "33,33") as basis points, or null. */
export function parsePercentBp(input: string | null, max = 100): number | null {
  if (input === null) return null;
  const text = input.trim().replace(",", ".").replace(/%$/, "");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(text)) return null;
  const bp = Math.round(Number(text) * 100);
  return bp <= max * 100 ? bp : null;
}

/**
 * Make every active subscription's deliveries ahead, as far as the food screens
 * look (PLAN_AHEAD_DAYS). The database skips days already made, so this is
 * safe to run on every visit; it costs one call per subscription.
 */
export async function planAhead(supabase: Supabase, org: Tables<"organizations">): Promise<void> {
  const today = todayIn(org.time_zone);
  const subs = await supabase.from("subscriptions").select("id").eq("org_id", org.id).or(`cancelled_on.is.null,cancelled_on.gt.${today}`);
  if (subs.error) return;
  const until = addDays(today, PLAN_AHEAD_DAYS);
  await Promise.all(subs.data.map((s) => supabase.rpc("plan_subscription", { p_subscription: s.id, p_until: until })));
}

/** A Google Maps link through every stop, in order, from the kennel. */
export function routeLink(stops: readonly { line: string | null; area: string | null; postal_code: string | null }[]): string {
  const places = stops.map((s) => [s.line, s.area, s.postal_code].filter(Boolean).join(", ")).filter((p) => p.length > 0);
  if (places.length === 0) return "https://www.google.com/maps";
  const destination = places[places.length - 1];
  const waypoints = places.slice(0, -1).slice(0, 9);
  const params = new URLSearchParams({ api: "1", destination, travelmode: "driving" });
  if (waypoints.length > 0) params.set("waypoints", waypoints.join("|"));
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

/** A link to one place in Google Maps: the parent's own map link when they gave one. */
export function placeLink(a: { map_url: string | null; line: string | null; area: string | null; postal_code: string | null }): string {
  if (a.map_url) return a.map_url;
  const q = [a.line, a.area, a.postal_code].filter(Boolean).join(", ");
  return `https://www.google.com/maps/search/?${new URLSearchParams({ api: "1", query: q }).toString()}`;
}

/** This moment, for a server page that compares with a cut-off. A server page is drawn once per request, so this is that request's time. */
export function requestTime(): number {
  return Date.now();
}
