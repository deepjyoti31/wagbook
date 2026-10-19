import { addDays, diffDays, isISODate, type ISODate } from "./dates";

/**
 * Periods and summaries for the reports screen. A month is written YYYY-MM.
 */

export type YearMonth = string;

export function isYearMonth(value: unknown): value is YearMonth {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}

/** First and last day of a month. */
export function monthBounds(month: YearMonth): { first: ISODate; last: ISODate } {
  const [y, m] = month.split("-").map(Number);
  const first = `${month}-01`;
  const next = m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
  return { first, last: addDays(next, -1) };
}

/** The month a number of months before or after this one. */
export function shiftMonth(month: YearMonth, by: number): YearMonth {
  const [y, m] = month.split("-").map(Number);
  const index = y * 12 + (m - 1) + by;
  return `${Math.floor(index / 12)}-${String((index % 12) + 1).padStart(2, "0")}`;
}

/** "October 2026". */
export function monthName(month: YearMonth, locale = "en-IN"): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

/** "Oct". */
export function shortMonthName(month: YearMonth, locale = "en-IN"): string {
  const [y, m] = month.split("-").map(Number);
  return new Intl.DateTimeFormat(locale, { month: "short", timeZone: "UTC" }).format(new Date(Date.UTC(y, m - 1, 1)));
}

export interface OccupancyDay {
  day: ISODate;
  boarding: number;
  dayBoarding: number;
  capacity: number;
  /** Kennels in use: two siblings sharing one count once. Defaults to the number of pets. */
  kennelsUsed?: number;
}

export interface OccupancySummary {
  /** Boarding nights sold: one pet staying one night. */
  nights: number;
  /** Day boarding days sold. */
  days: number;
  /** The fullest day, counting both kinds; the earliest when there is a tie. Null when nobody stayed. */
  busiest: { day: ISODate; pets: number } | null;
  /** Kennels used as a share of kennels available over the period, in whole percent. Null with no kennels. */
  percentFull: number | null;
}

export function summariseOccupancy(days: readonly OccupancyDay[]): OccupancySummary {
  let nights = 0;
  let dayCount = 0;
  let used = 0;
  let available = 0;
  let busiest: OccupancySummary["busiest"] = null;
  for (const d of days) {
    nights += d.boarding;
    dayCount += d.dayBoarding;
    const pets = d.boarding + d.dayBoarding;
    used += d.kennelsUsed ?? pets;
    available += d.capacity;
    if (pets > 0 && (!busiest || pets > busiest.pets)) busiest = { day: d.day, pets };
  }
  return { nights, days: dayCount, busiest, percentFull: available > 0 ? Math.round((used / available) * 100) : null };
}

/**
 * A date range from the CSV download form, or null when it is not usable:
 * both dates real, in order, and at most 400 days apart (as the database allows for reports).
 */
export function parseRange(from: unknown, to: unknown): { from: ISODate; to: ISODate } | null {
  if (!isISODate(from) || !isISODate(to) || to < from) return null;
  if (diffDays(from, to) > 400) return null;
  return { from, to };
}
