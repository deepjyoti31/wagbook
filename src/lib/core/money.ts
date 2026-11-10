/**
 * Money.
 *
 * RULE: money is always an integer number of minor units (paise for INR,
 * cents for USD). It is never a float and never a decimal string once it has
 * been parsed. The database uses `bigint` columns ending in `_minor`.
 */

/** Integer minor units, e.g. 120000 = Rs 1,200.00. */
export type Minor = number;

/** Throws unless the value is a safe integer. Use at trust boundaries. */
export function assertMinor(value: unknown, label = "amount"): asserts value is Minor {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new RangeError(`${label} must be an integer number of minor units, got ${String(value)}`);
  }
}

/**
 * Parse what a person typed ("1200", "1,200.50", "Rs 1200", "₹1,20,000")
 * into minor units. Returns null when the text is not a clean amount.
 * At most two decimal places are accepted; we never guess at rounding.
 */
export function parseMoney(input: string | number): Minor | null {
  const text = String(input)
    .replace(/[,\s]/g, "")
    .replace(/^(₹|rs\.?|inr)/i, "");
  const m = /^(-)?(\d+)(?:\.(\d{1,2}))?$/.exec(text);
  if (!m) return null;
  const whole = Number(m[2]);
  const frac = Number((m[3] ?? "").padEnd(2, "0"));
  const value = whole * 100 + frac;
  if (!Number.isSafeInteger(value)) return null;
  return m[1] ? -value : value;
}

export interface FormatMoneyOptions {
  /** ISO 4217 code. Defaults to INR. */
  currency?: string;
  /** BCP 47 locale. en-IN gives lakh and crore grouping (1,20,000). */
  locale?: string;
  /** Show "₹1,200" instead of "₹1,200.00" when there are no paise. */
  trimZeros?: boolean;
}

/** Format minor units for display, e.g. 12000000 -> "₹1,20,000.00". */
export function formatMoney(minor: Minor, options: FormatMoneyOptions = {}): string {
  assertMinor(minor);
  const { currency = "INR", locale = "en-IN", trimZeros = false } = options;
  const whole = minor % 100 === 0;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: trimZeros && whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(minor / 100);
}

/** "1200.00" with a dot and two decimals, as payment links require. */
export function toDecimalString(minor: Minor): string {
  assertMinor(minor);
  const sign = minor < 0 ? "-" : "";
  const abs = Math.abs(minor);
  return `${sign}${Math.trunc(abs / 100)}.${String(abs % 100).padStart(2, "0")}`;
}

/**
 * Multiply an amount by a quantity (which may be fractional), rounding half up.
 *
 * Quantities are kept to two decimals (numeric(10, 2) in the database), so the
 * sum is done in whole hundredths. 0.35 x 449.50 is 157.325 exactly; as floats
 * the product comes out just under the half and rounds down, where the
 * database's exact arithmetic rounds up (check_bill_line), and a bill a paisa
 * out is never issued (WB037). A quantity with more decimals is not a stored
 * quantity, and is multiplied as it is.
 */
export function multiply(minor: Minor, quantity: number): Minor {
  assertMinor(minor);
  if (!Number.isFinite(quantity)) throw new RangeError("quantity must be finite");
  const hundredths = Math.round(quantity * 100);
  const exact = minor * hundredths;
  if (Math.abs(quantity * 100 - hundredths) < 1e-4 && Number.isSafeInteger(exact)) {
    const abs = Math.abs(exact);
    const rest = abs % 100;
    const whole = (abs - rest) / 100 + (rest >= 50 ? 1 : 0);
    return exact < 0 ? -whole : whole;
  }
  return roundHalfUp(minor * quantity);
}

/** Take `bp` basis points of an amount (1800 bp = 18%), rounding half up. */
export function percentBp(minor: Minor, bp: number): Minor {
  assertMinor(minor);
  if (!Number.isInteger(bp) || bp < 0) throw new RangeError("basis points must be a non-negative integer");
  return roundHalfUp((minor * bp) / 10_000);
}

/** Round half away from zero, so that refunds mirror charges exactly. */
export function roundHalfUp(value: number): number {
  return value < 0 ? -Math.round(-value) : Math.round(value);
}

export function sum(values: readonly Minor[]): Minor {
  return values.reduce((a, b) => a + b, 0);
}
