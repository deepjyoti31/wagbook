import { addDays, eachDate, type ISODate } from "./dates";
import { isoWeekday, zonedInstant } from "./food";
import type { Minor } from "./money";
import { chargeableUnits, type BookingKind, type StayCharge } from "./stay";

/**
 * Cancellation rules and credit (M38, D47). Each night of a stay (each day of
 * day boarding) follows its own rule: a weekday or a weekend or holiday night,
 * cancelled with the notice or without it, is refunded, kept as credit, or
 * kept by the kennel. When the kennel cancels, the parent chooses a refund or
 * credit for everything. The money paid in advance goes to the refund first,
 * then to credit; the rest is kept. Pure: a manager confirms what it gives.
 */

export type CancelOutcome = "refund" | "credit" | "keep";
export const CANCEL_OUTCOMES = ["refund", "credit", "keep"] as const satisfies readonly CancelOutcome[];

export interface CancelRule {
  notice_hours: number;
  weekday_on_time: CancelOutcome;
  weekday_late: CancelOutcome;
  weekend_on_time: CancelOutcome;
  weekend_late: CancelOutcome;
}

/** The rule when a kennel has not set one: 24 hours; a weekday refunded with notice, credit otherwise; a weekend or holiday night as credit. Must match the defaults of cancellation_rules. */
export const DEFAULT_CANCEL_RULE: CancelRule = {
  notice_hours: 24,
  weekday_on_time: "refund",
  weekday_late: "credit",
  weekend_on_time: "credit",
  weekend_late: "credit",
};

export interface CancelUnit {
  date: ISODate;
  priceMinor: Minor;
}

export interface CancelInput {
  units: readonly CancelUnit[];
  /** When the parent asked to cancel. */
  askedAt: Date;
  /** The kennel's check-in time, "HH:MM": a night's notice runs to its day at this time. */
  checkInTime: string;
  timeZone: string;
  rule: CancelRule;
  /** ISO weekdays that count as the weekend (6 and 7 by default). */
  weekendDays: readonly number[];
  /** Holiday dates (peak periods marked as holidays). */
  holidays: ReadonlySet<ISODate>;
  /** The kennel cancelled: the parent chose everything as a refund, or as credit. */
  byKennel?: "refund" | "credit" | null;
  /** Money paid in advance for the stay, net of refunds already made. */
  paidMinor: Minor;
}

export interface CancelNight extends CancelUnit {
  weekend: boolean;
  onTime: boolean;
  outcome: CancelOutcome;
}

export interface CancelResult {
  nights: CancelNight[];
  /** What the nights are worth by outcome. */
  refundValue: Minor;
  creditValue: Minor;
  keptValue: Minor;
  /** What happens to the money paid: refund first, then credit; the rest is kept. */
  refundMinor: Minor;
  creditMinor: Minor;
  keptMinor: Minor;
}

/** The outcome of each night and of the money paid. */
export function cancellationOutcome(i: CancelInput): CancelResult {
  const nights = i.units.map((u): CancelNight => {
    const weekend = i.weekendDays.includes(isoWeekday(u.date)) || i.holidays.has(u.date);
    const starts = zonedInstant(u.date, i.checkInTime.slice(0, 5), i.timeZone).getTime();
    const onTime = starts - i.askedAt.getTime() >= i.rule.notice_hours * 3_600_000;
    const outcome = i.byKennel ?? (weekend ? (onTime ? i.rule.weekend_on_time : i.rule.weekend_late) : onTime ? i.rule.weekday_on_time : i.rule.weekday_late);
    return { ...u, weekend, onTime, outcome };
  });
  const value = (o: CancelOutcome) => nights.filter((n) => n.outcome === o).reduce((a, n) => a + n.priceMinor, 0);
  const refundValue = value("refund");
  const creditValue = value("credit");
  const keptValue = value("keep");
  const paid = Math.max(0, i.paidMinor);
  const refundMinor = Math.min(paid, refundValue);
  const creditMinor = Math.min(paid - refundMinor, creditValue);
  return { nights, refundValue, creditValue, keptValue, refundMinor, creditMinor, keptMinor: paid - refundMinor - creditMinor };
}

/** A payment for a stay with no bill yet: an advance, or money given back. */
export interface StayPayment {
  direction: string;
  amount_minor: Minor;
  method: string;
  created_at: string;
}

/**
 * The money of a cancelled stay: the advance it held when it was cancelled
 * (what came in, less what went back before), and what was given back since,
 * as a refund or as credit. Money given back since is the outcome being
 * settled, not less advance, or settling would start over on what is left.
 */
export function cancelledStayMoney(
  payments: readonly StayPayment[],
  cancelledAt: string | null,
): { paidMinor: Minor; given: { refundMinor: Minor; creditMinor: Minor } } {
  const since = cancelledAt === null ? Infinity : Date.parse(cancelledAt);
  let paidMinor = 0;
  const given = { refundMinor: 0, creditMinor: 0 };
  for (const p of payments) {
    if (p.direction === "in") paidMinor += p.amount_minor;
    else if (Date.parse(p.created_at) < since) paidMinor -= p.amount_minor;
    else if (p.method === "credit") given.creditMinor += p.amount_minor;
    else given.refundMinor += p.amount_minor;
  }
  return { paidMinor, given };
}

/**
 * What is still to give back of a cancelled stay's outcome once what was
 * given back since it was cancelled is taken off, so confirming it again
 * never gives the same money back twice: the refund first, then the credit.
 */
export function stillToSettle(
  r: Pick<CancelResult, "refundMinor" | "creditMinor">,
  given: { refundMinor: Minor; creditMinor: Minor },
): { refundMinor: Minor; creditMinor: Minor } {
  const left = Math.max(0, r.refundMinor + r.creditMinor - given.refundMinor - given.creditMinor);
  const refundMinor = Math.min(left, Math.max(0, r.refundMinor - given.refundMinor));
  return { refundMinor, creditMinor: left - refundMinor };
}

/** Every date of the peak periods marked as holidays. */
export function holidayDates(periods: readonly { start_date: ISODate; end_date: ISODate; is_holiday: boolean }[]): Set<ISODate> {
  return new Set(periods.filter((p) => p.is_holiday).flatMap((p) => eachDate(p.start_date, addDays(p.end_date, 1))));
}

/**
 * A stay's nights (or days) with what each is worth, from its charges
 * (stay_charges): days of day boarding first, then nights shared, then alone;
 * a package spread evenly, the odd paise on the last; a stay from a pack worth
 * nothing; the discount taken off the last nights.
 */
export function stayUnits(
  b: { kind: BookingKind; start_date: ISODate; end_date: ISODate; boarding_from?: ISODate | null; discount_minor: Minor; pass_id?: string | null },
  charges: readonly StayCharge[],
): CancelUnit[] {
  const n = chargeableUnits(b.kind, b.start_date, b.end_date);
  const dates = Array.from({ length: n }, (_, k) => addDays(b.start_date, k));
  let prices: number[];
  const pkg = charges.find((c) => c.part === "package");
  if (b.pass_id) prices = dates.map(() => 0);
  else if (pkg) {
    const each = Math.floor(pkg.unitPriceMinor / n);
    prices = dates.map((_, k) => (k === n - 1 ? pkg.unitPriceMinor - each * (n - 1) : each));
  } else {
    const order = ["days", "stay", "shared", "alone"] as const;
    prices = order.flatMap((part) => charges.filter((c) => c.part === part).flatMap((c) => Array.from({ length: c.quantity }, () => c.unitPriceMinor)));
    while (prices.length < n) prices.push(prices.at(-1) ?? 0);
    prices = prices.slice(0, n);
  }
  let discount = b.discount_minor;
  for (let k = n - 1; k >= 0 && discount > 0; k--) {
    const off = Math.min(prices[k], discount);
    prices[k] -= off;
    discount -= off;
  }
  return dates.map((date, k) => ({ date, priceMinor: prices[k] }));
}
