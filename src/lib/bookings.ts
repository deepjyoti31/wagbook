import type { Enums } from "./supabase/database.types";
import { formatDate, nightsBetween, type ISODate } from "./core";

/**
 * Words for bookings, shared by every screen that shows one. Kept out of the
 * "use server" files, which may export only async functions.
 */

export const STATUS_LABEL: Record<Enums<"booking_status">, string> = {
  requested: "Request",
  confirmed: "Confirmed",
  checked_in: "In house",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "Did not arrive",
};

/** "14 Apr 2027 to 17 Apr 2027, 3 nights" or "14 Apr 2027, 1 day". */
export function stayText(kind: Enums<"booking_kind">, startDate: ISODate, endDate: ISODate): string {
  const nights = nightsBetween(startDate, endDate);
  const units = kind === "boarding" ? nights : nights + 1;
  const dates = startDate === endDate ? formatDate(startDate) : `${formatDate(startDate)} to ${formatDate(endDate)}`;
  const unit = kind === "boarding" ? (units === 1 ? "night" : "nights") : units === 1 ? "day" : "days";
  return `${dates}, ${units} ${unit}`;
}

/** Warning tags are stored as snake_case; people read them with spaces. */
export function flagText(flag: string): string {
  return flag.replaceAll("_", " ");
}
