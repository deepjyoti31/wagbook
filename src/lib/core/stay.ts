import { diffDays, formatDate, isISODate, type ISODate } from "./dates";
import type { Minor } from "./money";
import { computeInvoice, type InvoiceTotals, type LineInput, type TaxContext } from "./tax";

/**
 * Stay pricing.
 *
 * A boarding stay is charged per night: check in on the 14th, check out on
 * the 17th, pay for 3 nights. Day boarding is charged per day and has no
 * night. What time a dog arrives or leaves does not change the price here;
 * kennels that charge for early arrival or late pickup add it as an add-on.
 */

export type BookingKind = "boarding" | "daycare";

/** Nights charged for a boarding stay. Check-out day is not a night. */
export function nightsBetween(startDate: ISODate, endDate: ISODate): number {
  if (!isISODate(startDate) || !isISODate(endDate)) throw new RangeError("stay dates must be ISO dates");
  const nights = diffDays(startDate, endDate);
  if (nights < 0) throw new RangeError("check-out cannot be before check-in");
  return nights;
}

/** Units charged: nights for boarding, days (inclusive) for day boarding. */
export function chargeableUnits(kind: BookingKind, startDate: ISODate, endDate: ISODate): number {
  const nights = nightsBetween(startDate, endDate);
  if (kind === "boarding") {
    if (nights < 1) throw new RangeError("a boarding stay needs at least one night");
    return nights;
  }
  return nights + 1;
}

export interface AddOn {
  description: string;
  quantity: number;
  unitPriceMinor: Minor;
  taxRateBp?: number;
  sacCode?: string | null;
}

export interface StayQuoteInput {
  kind: BookingKind;
  petName: string;
  startDate: ISODate;
  endDate: ISODate;
  /** Price per night (boarding) or per day (day boarding). */
  rateMinor: Minor;
  taxRateBp?: number;
  sacCode?: string | null;
  /** Discount on the stay line only, before tax. */
  discountMinor?: Minor;
  addOns?: readonly AddOn[];
}

/** Turn a stay into invoice lines. The stay itself is always the first line. */
export function stayLines(input: StayQuoteInput): LineInput[] {
  const units = chargeableUnits(input.kind, input.startDate, input.endDate);
  const what =
    input.kind === "boarding"
      ? `Boarding: ${input.petName}, ${units} ${units === 1 ? "night" : "nights"}`
      : `Day boarding: ${input.petName}, ${units} ${units === 1 ? "day" : "days"}`;
  return [
    {
      description: `${what} (${formatDate(input.startDate)} to ${formatDate(input.endDate)})`,
      quantity: units,
      unitPriceMinor: input.rateMinor,
      discountMinor: input.discountMinor ?? 0,
      taxRateBp: input.taxRateBp ?? 0,
      sacCode: input.sacCode ?? null,
    },
    ...(input.addOns ?? []).map((a) => ({
      description: a.description,
      quantity: a.quantity,
      unitPriceMinor: a.unitPriceMinor,
      taxRateBp: a.taxRateBp ?? 0,
      sacCode: a.sacCode ?? null,
    })),
  ];
}

/** Price a stay, with tax, ready to show as a quote or turn into an invoice. */
export function quoteStay(input: StayQuoteInput, ctx: TaxContext, options: { roundToWholeUnit?: boolean } = {}): InvoiceTotals {
  return computeInvoice(stayLines(input), ctx, options);
}
