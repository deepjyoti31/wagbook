/**
 * The team (M43, D48): the rota's week, who is on now, and the month's
 * attendance sheet for pay. Times on the rota are the kennel's clock
 * ("2026-11-03T07:00"); clocking in and out are instants.
 */

import { addDays, eachDate, isISODate, type ISODate } from "./dates";
import { zonedInstant } from "./food";

// The Monday of a week is weekStart() in food.ts.
import { monthBounds, type YearMonth } from "./reports";

/** A shift's start and end on the kennel's clock for a day: a shift that ends at or before its start ends the next day. */
export function shiftSpan(day: ISODate, startsAt: string, endsAt: string): { start: string; end: string } {
  const from = startsAt.slice(0, 5);
  const to = endsAt.slice(0, 5);
  return { start: `${day}T${from}`, end: `${to <= from ? addDays(day, 1) : day}T${to}` };
}

/** True when a shift ends the next day (a night shift). */
export function endsNextDay(startsAt: string, endsAt: string): boolean {
  return endsAt.slice(0, 5) <= startsAt.slice(0, 5);
}

/** The seven days of the week that starts on a Monday. */
export function weekDays(monday: ISODate): ISODate[] {
  return eachDate(monday, addDays(monday, 7));
}

export interface RotaSpan {
  user_id: string;
  /** Never empty once saved; the database fills both in from the shift. */
  starts_at: string | null;
  ends_at: string | null;
}

/** "2026-11-03 07:00:00" or "2026-11-03T07:00:00" as "2026-11-03T07:00". */
function clock(text: string): string {
  return text.replace(" ", "T").slice(0, 16);
}

/** Rota rows going on at a moment on the kennel's clock ("2026-11-03T14:30"): started, not yet ended. */
export function onRotaNow<R extends RotaSpan>(rows: readonly R[], now: string): R[] {
  const at = clock(now);
  return rows.filter((r) => r.starts_at && r.ends_at && clock(r.starts_at) <= at && at < clock(r.ends_at));
}

/** Whole minutes from one instant to the next, never below nothing. */
export function minutesBetween(from: string | Date, to: string | Date): number {
  return Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 60_000));
}

/** Minutes as hours and minutes, "7:05". */
export function formatHours(minutes: number): string {
  const m = Math.max(0, Math.round(minutes));
  return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")}`;
}

/** Minutes as decimal hours for a spreadsheet, "7.08". */
export function decimalHours(minutes: number): string {
  return (Math.max(0, minutes) / 60).toFixed(2);
}

/** The days of leave from one day to another that fall in a month (both ends included). */
export function leaveDaysIn(month: YearMonth, from: ISODate, to: ISODate): ISODate[] {
  const { first, last } = monthBounds(month);
  const start = from > first ? from : first;
  const end = to < last ? to : last;
  return start <= end ? eachDate(start, addDays(end, 1)) : [];
}

export interface Stretch {
  user_id: string;
  work_date: ISODate;
  clocked_in_at: string;
  clocked_out_at: string | null;
}

export interface SheetPerson {
  user_id: string;
  display_name: string;
}

export interface SheetDay {
  date: ISODate;
  /** Minutes worked, from stretches clocked out. */
  minutes: number;
  /** Stretches begun that day (one usually). */
  stretches: number;
  /** A stretch begun that day is still open: not clocked out. */
  open: boolean;
  onLeave: boolean;
  /** Shifts on the rota that day. */
  shifts: number;
}

export interface SheetRow {
  person: SheetPerson;
  days: SheetDay[];
  daysWorked: number;
  minutes: number;
  leaveDays: number;
  rotaShifts: number;
  /** Stretches not clocked out, which an owner or manager should put right. */
  open: number;
}

/**
 * A month's attendance for pay, a row a person and a line a day. A stretch
 * counts on the day it began (a night shift on its evening), and only once
 * clocked out; an open one is flagged. Leave is granted leave only.
 */
export function attendanceSheet(
  month: YearMonth,
  people: readonly SheetPerson[],
  stretches: readonly Stretch[],
  leave: readonly { user_id: string; starts_on: ISODate; ends_on: ISODate }[],
  rota: readonly { user_id: string; work_date: ISODate }[],
): SheetRow[] {
  const { first, last } = monthBounds(month);
  const dates = eachDate(first, addDays(last, 1));
  return people.map((person) => {
    const mine = stretches.filter((s) => s.user_id === person.user_id && s.work_date >= first && s.work_date <= last);
    const off = new Set(leave.filter((l) => l.user_id === person.user_id).flatMap((l) => leaveDaysIn(month, l.starts_on, l.ends_on)));
    const days = dates.map((date): SheetDay => {
      const that = mine.filter((s) => s.work_date === date);
      return {
        date,
        minutes: that.reduce((sum, s) => sum + (s.clocked_out_at ? minutesBetween(s.clocked_in_at, s.clocked_out_at) : 0), 0),
        stretches: that.length,
        open: that.some((s) => !s.clocked_out_at),
        onLeave: off.has(date),
        shifts: rota.filter((r) => r.user_id === person.user_id && r.work_date === date).length,
      };
    });
    return {
      person,
      days,
      daysWorked: days.filter((d) => d.stretches > 0).length,
      minutes: days.reduce((sum, d) => sum + d.minutes, 0),
      leaveDays: off.size,
      rotaShifts: days.reduce((sum, d) => sum + d.shifts, 0),
      open: mine.filter((s) => !s.clocked_out_at).length,
    };
  });
}

/** "HH:MM" from a form, or null. */
export function clockTime(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(value.trim().slice(0, 5));
  return m ? `${m[1]}:${m[2]}` : null;
}

/**
 * A stretch typed on the kennel's clock: a day, a time in and perhaps a time
 * out, an out earlier than the in being the next day. As instants.
 */
export function stretchFrom(day: string, timeIn: string, timeOut: string | null, timeZone: string): { in: string; out: string | null } | null {
  if (!isISODate(day)) return null;
  const start = zonedInstant(day, timeIn, timeZone);
  if (!timeOut) return { in: start.toISOString(), out: null };
  let end = zonedInstant(day, timeOut, timeZone);
  if (end <= start) end = zonedInstant(addDays(day, 1), timeOut, timeZone);
  return { in: start.toISOString(), out: end.toISOString() };
}

