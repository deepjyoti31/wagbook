import type { Enums } from "./supabase/database.types";
import { formatDate, nightsBetween, type ISODate } from "./core";
import { fill, plural, type Language } from "./i18n";
import type { Messages } from "@/messages";

/**
 * Words for bookings, shared by every screen that shows one. Kept out of the
 * "use server" files, which may export only async functions.
 */

type Words = { language: Language; m: Messages; locale: string };

/** "14 Apr 2027 to 17 Apr 2027, 3 nights" or "14 Apr 2027, 1 day", in the reader's language. */
export function stayText(t: Words, kind: Enums<"booking_kind">, startDate: ISODate, endDate: ISODate): string {
  const nights = nightsBetween(startDate, endDate);
  const units = kind === "boarding" ? nights : nights + 1;
  return fill(t.m.stay.withLength, {
    dates: datesText(t, startDate, endDate),
    length: plural(t.language, units, kind === "boarding" ? t.m.stay.nights : t.m.stay.days),
  });
}

/** "14 Apr 2027 to 17 Apr 2027", or one date when they are the same. */
export function datesText(t: Words, startDate: ISODate, endDate: ISODate): string {
  return startDate === endDate
    ? formatDate(startDate, t.locale)
    : fill(t.m.stay.dates, { start: formatDate(startDate, t.locale), end: formatDate(endDate, t.locale) });
}

/** Warning tags are stored as snake_case; people read them in their own words. */
export function flagText(m: Messages, flag: string): string {
  return (m.labels.flags as Record<string, string>)[flag] ?? flag.replaceAll("_", " ");
}
