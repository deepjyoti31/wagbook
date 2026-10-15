import { addDays, stayHoldsUntil, type ISODate, type StaySpan } from "./dates";

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
  /** For each kennel id, the stay holding it on each day (null when free). */
  byKennel: Map<string, (B | null)[]>;
  /** Stays with no kennel yet, for each day. */
  unassigned: B[][];
}

/**
 * Lay stays out on a grid of kennels by days. A cell holds the stay that holds
 * that kennel on that day (see stayHoldsUntil), so a boarding stay is not shown
 * on its check-out day and the next pet can be.
 */
export function calendarGrid<B extends CalendarStay>(kennelIds: readonly string[], stays: readonly B[], days: readonly ISODate[]): CalendarGrid<B> {
  const byKennel = new Map<string, (B | null)[]>(kennelIds.map((id) => [id, days.map(() => null)]));
  const unassigned: B[][] = days.map(() => []);
  for (const stay of stays) {
    const until = stayHoldsUntil(stay);
    days.forEach((day, i) => {
      if (day < stay.startDate || day >= until) return;
      const row = stay.kennelId ? byKennel.get(stay.kennelId) : undefined;
      if (row) row[i] = stay;
      else unassigned[i].push(stay);
    });
  }
  return { byKennel, unassigned };
}
