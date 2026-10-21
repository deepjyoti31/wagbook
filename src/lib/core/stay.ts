import { addDays, diffDays, formatDate, isISODate, type ISODate } from "./dates";
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

/**
 * One line of what a stay costs. Usually the whole stay ("stay"). A stay that
 * began as day boarding and became boarding has its "days" first. A pet at the
 * shared kennel price has its nights "shared" with a sibling and its nights
 * "alone" with the kennel to itself (at the usual price).
 */
export type StayPart = "stay" | "days" | "shared" | "alone";

export interface StayCharge {
  part: StayPart;
  quantity: number;
  unitPriceMinor: Minor;
  discountMinor: Minor;
}

/** Turn the rows of stay_charges() in the database into charges. */
export function toStayCharges(rows: readonly { part: string; quantity: number; unit_price_minor: number; discount_minor: number }[]): StayCharge[] {
  return rows.map((r) => ({
    part: r.part === "days" || r.part === "shared" || r.part === "alone" ? r.part : "stay",
    quantity: r.quantity,
    unitPriceMinor: r.unit_price_minor,
    discountMinor: r.discount_minor,
  }));
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
  /** A stay that began as day boarding and became boarding: its first night. */
  boardingFrom?: ISODate | null;
  /**
   * What the stay costs, from stay_charges() in the database, when it is more
   * than every night at the booked rate. Without it: the whole stay at rateMinor.
   */
  charges?: readonly StayCharge[];
  addOns?: readonly AddOn[];
}

/** Every night or day of a stay at its booked rate: what a stay costs unless it is split. */
export function wholeStayCharge(input: Pick<StayQuoteInput, "kind" | "startDate" | "endDate" | "rateMinor" | "discountMinor">): StayCharge[] {
  return [{ part: "stay", quantity: chargeableUnits(input.kind, input.startDate, input.endDate), unitPriceMinor: input.rateMinor, discountMinor: input.discountMinor ?? 0 }];
}

/** What a stay line says on a bill. Stored with the bill, so in English like the rest of its lines. */
function describeCharge(input: StayQuoteInput, c: StayCharge): string {
  const from = input.boardingFrom ?? input.startDate;
  const dates = (a: ISODate, b: ISODate) => `(${formatDate(a)} to ${formatDate(b)})`;
  const days = (n: number) => `${n} ${n === 1 ? "day" : "days"}`;
  if (c.part === "days") return `Day boarding: ${input.petName}, ${days(c.quantity)} ${dates(input.startDate, addDays(from, -1))}`;
  const kind = input.kind === "boarding" ? "Boarding" : "Day boarding";
  const units = input.kind === "boarding" ? `${c.quantity} ${c.quantity === 1 ? "night" : "nights"}` : days(c.quantity);
  if (c.part === "shared") return `${kind}: ${input.petName}, ${units} sharing a kennel ${dates(from, input.endDate)}`;
  if (c.part === "alone") return `${kind}: ${input.petName}, ${units} with the kennel to itself`;
  return `${kind}: ${input.petName}, ${units} ${dates(from, input.endDate)}`;
}

/** Turn a stay into invoice lines: the stay first (one line, or its parts), then each extra. */
export function stayLines(input: StayQuoteInput): LineInput[] {
  const charges = input.charges ?? wholeStayCharge(input);
  return [
    ...charges.map((c) => ({
      description: describeCharge(input, c),
      quantity: c.quantity,
      unitPriceMinor: c.unitPriceMinor,
      discountMinor: c.discountMinor,
      taxRateBp: input.taxRateBp ?? 0,
      sacCode: input.sacCode ?? null,
    })),
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
