import { diffDays, isISODate, type ISODate } from "./dates";
import type { Minor } from "./money";

/**
 * The estimate on the booking form for new parents (M41): the kennel's usual
 * price for what was asked, before anyone has looked at it. A stay is its
 * nights (boarding) or days (daycare) at the usual price; an appointment is
 * its service's price, "from" when it depends on the dog, and nothing when
 * the price is agreed on quote. Nothing is charged: staff confirm the price.
 */

export interface EstimateChoice {
  /** "boarding", "daycare", or an appointment service's id. */
  what: string;
  start: string | null;
  end: string | null;
}

export interface EstimatePrices {
  boarding: Minor | null;
  daycare: Minor | null;
  services: readonly { id: string; price_minor: Minor | null; from: boolean }[];
}

export type Estimate = { minor: Minor; units: number; from: boolean } | { quote: true } | null;

export function bookingEstimate(c: EstimateChoice, p: EstimatePrices, pets = 1): Estimate {
  if (c.what === "boarding" || c.what === "daycare") {
    const price = p[c.what];
    if (price === null || !c.start || !isISODate(c.start)) return null;
    const end = c.end && isISODate(c.end) ? c.end : c.start;
    const span = diffDays(c.start, end);
    if (span < 0) return null;
    // Boarding is nights, at least one; daycare is days, both ends counted.
    const units = c.what === "boarding" ? Math.max(1, span) : span + 1;
    return { minor: price * units * pets, units, from: false };
  }
  const service = p.services.find((s) => s.id === c.what);
  if (!service) return null;
  if (service.price_minor === null) return { quote: true };
  return { minor: service.price_minor * pets, units: 1, from: service.from };
}
