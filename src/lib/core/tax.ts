import { assertMinor, percentBp, roundHalfUp, sum, type Minor } from "./money";

/**
 * Tax on invoice lines.
 *
 * Three modes cover a kennel anywhere in the world:
 *   none       no tax is charged (an Indian kennel below the GST threshold,
 *              or any business that is not registered for tax)
 *   simple     one tax at one rate (VAT, sales tax)
 *   gst_india  India GST: CGST + SGST when buyer and seller are in the same
 *              state, IGST when they are not
 *
 * Rates are integers in basis points: 1800 = 18%.
 */

export type TaxMode = "none" | "simple" | "gst_india";

export interface TaxContext {
  mode: TaxMode;
  /** GST state code of the kennel, e.g. "29" for Karnataka. gst_india only. */
  sellerStateCode?: string | null;
  /**
   * GST state code of the place of supply. For boarding this is where the
   * kennel is, so it normally equals the seller's state. gst_india only.
   */
  placeOfSupplyStateCode?: string | null;
  /** True when listed prices already contain the tax. */
  pricesIncludeTax?: boolean;
}

export interface LineInput {
  description: string;
  quantity: number;
  unitPriceMinor: Minor;
  /** Discount on this line, in minor units, taken off before tax. */
  discountMinor?: Minor;
  /** Tax rate in basis points. Ignored when mode is "none". */
  taxRateBp?: number;
  /** Service accounting code printed on Indian tax invoices. */
  sacCode?: string | null;
}

export interface LineResult extends Required<Pick<LineInput, "description" | "quantity" | "unitPriceMinor">> {
  sacCode: string | null;
  discountMinor: Minor;
  taxRateBp: number;
  /** Value on which tax is charged. */
  taxableMinor: Minor;
  cgstMinor: Minor;
  sgstMinor: Minor;
  igstMinor: Minor;
  /** Total tax on the line: cgst + sgst + igst, or the single tax in "simple" mode. */
  taxMinor: Minor;
  /** taxable + tax. */
  totalMinor: Minor;
}

export interface InvoiceTotals {
  lines: LineResult[];
  subtotalMinor: Minor;
  discountMinor: Minor;
  taxableMinor: Minor;
  cgstMinor: Minor;
  sgstMinor: Minor;
  igstMinor: Minor;
  taxMinor: Minor;
  /** Adjustment that brings the grand total to a whole rupee. Zero unless asked for. */
  roundOffMinor: Minor;
  totalMinor: Minor;
}

/** True when CGST + SGST applies (same state) rather than IGST. */
export function isIntraState(ctx: TaxContext): boolean {
  if (!ctx.sellerStateCode) return true;
  return (ctx.placeOfSupplyStateCode ?? ctx.sellerStateCode) === ctx.sellerStateCode;
}

/** Work out one invoice line. Each tax component is rounded to the paisa. */
export function computeLine(line: LineInput, ctx: TaxContext): LineResult {
  assertMinor(line.unitPriceMinor, "unit price");
  if (!Number.isFinite(line.quantity) || line.quantity < 0) throw new RangeError("quantity must be zero or more");
  const discountMinor = line.discountMinor ?? 0;
  assertMinor(discountMinor, "discount");
  const rateBp = ctx.mode === "none" ? 0 : (line.taxRateBp ?? 0);
  if (!Number.isInteger(rateBp) || rateBp < 0) throw new RangeError("tax rate must be a non-negative integer of basis points");

  const gross = roundHalfUp(line.unitPriceMinor * line.quantity);
  if (discountMinor < 0 || discountMinor > gross) throw new RangeError("discount must be between zero and the line amount");
  const afterDiscount = gross - discountMinor;

  // When prices include tax, back the tax out so the customer pays exactly the listed price.
  const inclusive = Boolean(ctx.pricesIncludeTax) && rateBp > 0;
  let taxableMinor = inclusive ? roundHalfUp((afterDiscount * 10_000) / (10_000 + rateBp)) : afterDiscount;

  let cgstMinor = 0;
  let sgstMinor = 0;
  let igstMinor = 0;
  let taxMinor = 0;

  if (rateBp > 0) {
    if (ctx.mode === "gst_india" && isIntraState(ctx)) {
      // CGST and SGST are always equal: half the rate each.
      if (inclusive) {
        // Keep the halves equal and let the taxable value absorb an odd paisa,
        // so taxable + CGST + SGST still equals the listed price exactly.
        cgstMinor = roundHalfUp((afterDiscount - taxableMinor) / 2);
        taxableMinor = afterDiscount - 2 * cgstMinor;
      } else {
        cgstMinor = roundHalfUp((taxableMinor * rateBp) / 20_000);
      }
      sgstMinor = cgstMinor;
      taxMinor = cgstMinor + sgstMinor;
    } else {
      taxMinor = inclusive ? afterDiscount - taxableMinor : percentBp(taxableMinor, rateBp);
      if (ctx.mode === "gst_india") igstMinor = taxMinor;
    }
  }

  return {
    description: line.description,
    quantity: line.quantity,
    unitPriceMinor: line.unitPriceMinor,
    sacCode: line.sacCode ?? null,
    discountMinor,
    taxRateBp: rateBp,
    taxableMinor,
    cgstMinor,
    sgstMinor,
    igstMinor,
    taxMinor,
    totalMinor: taxableMinor + taxMinor,
  };
}

/**
 * Work out a whole invoice.
 * `roundToWholeUnit` adds a round-off line so the total is a whole rupee,
 * which is common on Indian invoices and convenient for cash and UPI.
 */
export function computeInvoice(
  lines: readonly LineInput[],
  ctx: TaxContext,
  options: { roundToWholeUnit?: boolean } = {},
): InvoiceTotals {
  const results = lines.map((l) => computeLine(l, ctx));
  const taxableMinor = sum(results.map((l) => l.taxableMinor));
  const cgstMinor = sum(results.map((l) => l.cgstMinor));
  const sgstMinor = sum(results.map((l) => l.sgstMinor));
  const igstMinor = sum(results.map((l) => l.igstMinor));
  const taxMinor = sum(results.map((l) => l.taxMinor));
  const discountMinor = sum(results.map((l) => l.discountMinor));
  const exact = taxableMinor + taxMinor;
  const totalMinor = options.roundToWholeUnit ? roundHalfUp(exact / 100) * 100 : exact;
  return {
    lines: results,
    subtotalMinor: sum(results.map((l) => roundHalfUp(l.unitPriceMinor * l.quantity))),
    discountMinor,
    taxableMinor,
    cgstMinor,
    sgstMinor,
    igstMinor,
    taxMinor,
    roundOffMinor: totalMinor - exact,
    totalMinor,
  };
}

/**
 * A tax rate typed as a percent, such as "18" or "2.5", in basis points
 * (1800, 250). Null when nothing was typed; undefined when it is not a rate
 * from 0 to 100 with at most two decimals.
 */
export function parseRatePercent(typed: string | null | undefined): number | null | undefined {
  const t = (typed ?? "").trim().replace(/%$/, "").trim();
  if (t === "") return null;
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(t)) return undefined;
  const bp = Math.round(Number(t) * 100);
  return bp <= 10000 ? bp : undefined;
}

/** A services accounting code (SAC or HSN): 4 to 8 digits. Must match the check on services.sac_code. */
export function isSacCode(code: string): boolean {
  return /^[0-9]{4,8}$/.test(code);
}
