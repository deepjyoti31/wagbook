import { addDays, isISODate, staysOverlap, stayHoldsUntil, type ISODate, type StaySpan } from "./dates";

/**
 * Small rules about bookings that screens need and the database does not
 * decide: peak periods a stay touches, overstays, and the calendar grid.
 */

export interface PeakPeriod {
  name: string;
  /** First day of the period. */
  startDate: ISODate;
  /** Last day of the period, inclusive. */
  endDate: ISODate;
  noRefund: boolean;
  /** Play session length during the period, or null for the usual length. */
  playSessionMinutes?: number | null;
}

/**
 * Peak periods a stay touches: any day the stay holds its kennel falls inside
 * the period. A boarding stay that checks out on the first day of a period does
 * not touch it, because the pet does not stay that night.
 */
export function peaksTouching<P extends PeakPeriod>(stay: StaySpan, periods: readonly P[]): P[] {
  const holdsUntil = stayHoldsUntil(stay);
  return periods.filter((p) => stay.startDate < addDays(p.endDate, 1) && p.startDate < holdsUntil);
}

/** Play session length on a day: the shortest set by a peak period covering it, otherwise the usual length. */
export function playMinutesOn(date: ISODate, usualMinutes: number, periods: readonly PeakPeriod[]): number {
  const overrides = periods
    .filter((p) => p.startDate <= date && date <= p.endDate && p.playSessionMinutes)
    .map((p) => p.playSessionMinutes as number);
  return overrides.length > 0 ? Math.min(...overrides) : usualMinutes;
}

/** A pet still checked in after its check-out date. */
export function isOverstaying(booking: { status: string; endDate: ISODate }, today: ISODate): boolean {
  return booking.status === "checked_in" && booking.endDate < today;
}

/** `count` consecutive dates starting at `from`. */
export function calendarDays(from: ISODate, count: number): ISODate[] {
  return Array.from({ length: count }, (_, i) => addDays(from, i));
}

export interface CalendarStay extends StaySpan {
  id: string;
  kennelId: string | null;
}

export interface CalendarGrid<B extends CalendarStay> {
  /** For each kennel id, the stays holding it on each day: none when free, two when siblings share it. */
  byKennel: Map<string, B[][]>;
  /** Stays with no kennel yet, for each day. */
  unassigned: B[][];
}

/**
 * Lay stays out on a grid of kennels by days. A cell holds the stays that hold
 * that kennel on that day (see stayHoldsUntil), so a boarding stay is not shown
 * on its check-out day and the next pet can be. Two siblings sharing a kennel
 * are both in its cell.
 */
export function calendarGrid<B extends CalendarStay>(kennelIds: readonly string[], stays: readonly B[], days: readonly ISODate[]): CalendarGrid<B> {
  const byKennel = new Map<string, B[][]>(kennelIds.map((id) => [id, days.map(() => [])]));
  const unassigned: B[][] = days.map(() => []);
  for (const stay of stays) {
    const until = stayHoldsUntil(stay);
    days.forEach((day, i) => {
      if (day < stay.startDate || day >= until) return;
      const row = stay.kennelId ? byKennel.get(stay.kennelId) : undefined;
      (row ? row[i] : unassigned[i]).push(stay);
    });
  }
  return { byKennel, unassigned };
}

/** The most pets one kennel holds: two, and only of one parent. Must match bookings_check_capacity() (WB027). */
export const PETS_PER_KENNEL = 2;

/** A booking that holds a kennel: confirmed or checked in, with a kennel chosen. */
export interface KennelHold extends StaySpan {
  kennelId: string;
  /** The parent of the pet holding it. Without one, a hold is treated as another parent's. */
  clientId?: string | null;
}

/**
 * The stay a booking form describes, or null while it is not yet a stay. An
 * empty check-out date means a single day of day boarding; a boarding stay
 * needs a check-out date after its check-in date.
 */
export function stayFromForm(kind: string, startDate: string, endDate: string): StaySpan | null {
  if (!isISODate(startDate)) return null;
  if (kind === "daycare") {
    const end = endDate === "" ? startDate : endDate;
    return isISODate(end) && end >= startDate ? { kind, startDate, endDate: end } : null;
  }
  if (kind === "boarding") return isISODate(endDate) && endDate > startDate ? { kind, startDate, endDate } : null;
  return null;
}

/**
 * Kennels that can take `pets` more pets (one, or two sharing) for a stay, in
 * the order given. A kennel is free when nobody holds it on any day of the
 * stay, or, given the parent, when only that parent's pets hold it and there
 * is room on every day (a kennel holds two). With no stay yet, every kennel.
 * Must agree with available_kennels() in the database, which has the last word
 * when the booking is saved.
 */
export function freeKennels<K extends { id: string }>(
  kennels: readonly K[],
  holds: readonly KennelHold[],
  stay: StaySpan | null,
  options: { clientId?: string | null; pets?: number } = {},
): K[] {
  if (!stay) return [...kennels];
  const pets = options.pets ?? 1;
  const overlapping = holds.filter((h) => staysOverlap(h, stay));
  const days: ISODate[] = [];
  for (let d = stay.startDate; d < stayHoldsUntil(stay); d = addDays(d, 1)) days.push(d);
  return kennels.filter((k) => {
    const here = overlapping.filter((h) => h.kennelId === k.id);
    if (here.some((h) => !options.clientId || h.clientId !== options.clientId)) return false;
    return days.every((day) => here.filter((h) => h.startDate <= day && day < stayHoldsUntil(h)).length + pets <= PETS_PER_KENNEL);
  });
}

/**
 * Does a pet match what was typed into a search box? Words match the pet's
 * name, breed or parent's name anywhere, ignoring case; three or more digits
 * match anywhere in the parent's phone number.
 */
export function petMatches(
  pet: { name: string; breed: string | null; parentName: string | null; parentPhone: string | null },
  query: string,
): boolean {
  const q = query.trim().toLocaleLowerCase();
  if (q === "") return true;
  const digits = q.replace(/[^0-9]/g, "");
  if (digits.length >= 3 && /^[0-9+\s()-]+$/.test(q)) return (pet.parentPhone ?? "").includes(digits);
  const text = [pet.name, pet.breed, pet.parentName].filter(Boolean).join(" ").toLocaleLowerCase();
  return q.split(/\s+/).every((word) => text.includes(word));
}

/**
 * Who is already in each kennel a stay could share: for every kennel held on
 * a day of the stay by another booking of the same parent, those pets' names.
 * Used to label "K05, with Bruno" where kennels are offered.
 */
export function sharedWith(
  stay: StaySpan & { id?: string; clientId: string },
  holds: readonly (KennelHold & { id: string; petName: string })[],
): Map<string, string[]> {
  const names = new Map<string, string[]>();
  for (const h of holds) {
    if (h.id === stay.id || h.clientId !== stay.clientId || !staysOverlap(h, stay)) continue;
    names.set(h.kennelId, [...(names.get(h.kennelId) ?? []), h.petName]);
  }
  return names;
}

/** The most days one repeating series makes. */
export const MAX_SERIES_DAYS = 70;

/**
 * The days of a repeating day boarding series: every date from `start` to
 * `until` (both included) that falls on one of `weekdays` (0 Sunday to 6
 * Saturday). At most MAX_SERIES_DAYS; null when the series is not valid.
 */
export function seriesDates(start: ISODate, until: ISODate, weekdays: readonly number[]): ISODate[] | null {
  if (!isISODate(start) || !isISODate(until) || until < start || weekdays.length === 0) return null;
  if (weekdays.some((d) => !Number.isInteger(d) || d < 0 || d > 6)) return null;
  const out: ISODate[] = [];
  for (let d = start; d <= until; d = addDays(d, 1)) {
    if (weekdays.includes(new Date(`${d}T00:00:00Z`).getUTCDay())) out.push(d);
    if (out.length > MAX_SERIES_DAYS) return null;
  }
  return out.length > 0 ? out : null;
}

/**
 * Which days of a series a parent's packs pay for: each day goes on the pack
 * that ends soonest among those that cover it and still have days left. A day
 * no pack covers is null (it is priced as usual).
 */
export function payFromPacks(dates: readonly ISODate[], packs: readonly { id: string; startsOn: ISODate; validUntil: ISODate; daysLeft: number }[], petsPerDay = 1): (string | null)[] {
  const left = new Map(packs.map((p) => [p.id, p.daysLeft]));
  const order = [...packs].sort((a, b) => a.validUntil.localeCompare(b.validUntil));
  return dates.map((d) => {
    const pack = order.find((p) => p.startsOn <= d && d <= p.validUntil && (left.get(p.id) ?? 0) >= petsPerDay);
    if (!pack) return null;
    left.set(pack.id, (left.get(pack.id) ?? 0) - petsPerDay);
    return pack.id;
  });
}
