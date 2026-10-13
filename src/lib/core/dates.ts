/**
 * Calendar-date helpers.
 *
 * Wagbook stores stay dates as plain calendar dates ("2027-04-14"), never as
 * timestamps, because a booking belongs to a day at the kennel and not to an
 * instant in time. All arithmetic here is done in UTC so that the server's
 * own time zone can never shift a date by one day.
 */

/** A calendar date in ISO form, e.g. "2027-04-14". */
export type ISODate = string;

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/** True when the string is a real calendar date in YYYY-MM-DD form. */
export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string") return false;
  const m = ISO_DATE.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const t = new Date(Date.UTC(y, mo - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === mo - 1 && t.getUTCDate() === d;
}

function toUTC(date: ISODate): number {
  if (!isISODate(date)) throw new RangeError(`Not a valid ISO date: ${String(date)}`);
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, m - 1, d);
}

function fromUTC(ms: number): ISODate {
  return new Date(ms).toISOString().slice(0, 10);
}

const DAY_MS = 86_400_000;

/** Add (or subtract) whole days. */
export function addDays(date: ISODate, days: number): ISODate {
  return fromUTC(toUTC(date) + Math.trunc(days) * DAY_MS);
}

/** Whole days from `from` to `to`. Negative when `to` is earlier. */
export function diffDays(from: ISODate, to: ISODate): number {
  return Math.round((toUTC(to) - toUTC(from)) / DAY_MS);
}

/** Every date from `start` up to but not including `end`. */
export function eachDate(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  for (let d = start; d < end; d = addDays(d, 1)) out.push(d);
  return out;
}

/**
 * Today's calendar date in a given IANA time zone.
 * A kennel in Bengaluru and a server in Virginia disagree about "today" for
 * several hours a day, so always pass the organisation's time zone.
 */
export function todayIn(timeZone: string, now: Date = new Date()): ISODate {
  // The en-CA locale formats dates as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** "14 Apr 2027" style, for people. */
export function formatDate(date: ISODate, locale = "en-IN"): string {
  return new Intl.DateTimeFormat(locale, {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(toUTC(date)));
}

/**
 * Financial year label for a date.
 * India's financial year runs 1 April to 31 March, so 14 Apr 2027 is in
 * "2027-28" and 2 Feb 2027 is in "2026-27". `startMonth` is 1-based and lets
 * other countries use their own year start (1 = calendar year).
 */
export function fiscalYear(date: ISODate, startMonth = 4): string {
  if (!isISODate(date)) throw new RangeError(`Not a valid ISO date: ${String(date)}`);
  const [y, m] = date.split("-").map(Number);
  if (startMonth === 1) return String(y);
  const startYear = m >= startMonth ? y : y - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** A stay, as far as holding a kennel is concerned. */
export interface StaySpan {
  kind: "boarding" | "daycare";
  startDate: ISODate;
  endDate: ISODate;
}

/**
 * The day after the last day a stay holds its kennel.
 * Boarding holds the nights from check-in up to, not including, check-out, so
 * the kennel is free again on the check-out day. Day boarding holds every day
 * from the first to the last inclusive.
 * Must match stay_range() in supabase/migrations/20261008000300_kennels_and_bookings.sql.
 */
export function stayHoldsUntil(stay: StaySpan): ISODate {
  return stay.kind === "daycare" ? addDays(stay.endDate, 1) : stay.endDate;
}

/** Do two stays hold a kennel on the same day? */
export function staysOverlap(a: StaySpan, b: StaySpan): boolean {
  return a.startDate < stayHoldsUntil(b) && b.startDate < stayHoldsUntil(a);
}
