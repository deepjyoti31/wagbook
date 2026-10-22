import type { ISODate } from "./dates";
import type { Minor } from "./money";
import type { LineInput } from "./tax";

/**
 * Pick-ups and drops on a stay's bill (M39): one line each, after the stay's
 * appointments, as invoice_expected_lines() counts them. A cancelled trip is
 * not billed. The description is stored on the bill, in English like the
 * other lines: "Pick-up for Biscuit (3 Nov, 09:00)".
 */

export interface BillableTrip {
  kind: "pickup" | "drop";
  status: string;
  trip_date: ISODate;
  at_time: string;
  price_minor: Minor | null;
  tax_rate_bp: number;
  sac_code: string | null;
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function tripLines(petName: string, trips: readonly BillableTrip[]): LineInput[] {
  return trips
    .filter((t) => t.status !== "cancelled")
    .sort((a, b) => `${a.trip_date} ${a.at_time}`.localeCompare(`${b.trip_date} ${b.at_time}`))
    .map((t) => ({
      description: `${t.kind === "pickup" ? "Pick-up" : "Drop"} for ${petName} (${Number(t.trip_date.slice(8, 10))} ${MONTHS[Number(t.trip_date.slice(5, 7)) - 1]}, ${t.at_time.slice(0, 5)})`.slice(0, 300),
      quantity: 1,
      unitPriceMinor: t.price_minor ?? 0,
      taxRateBp: t.tax_rate_bp,
      sacCode: t.sac_code,
    }));
}
