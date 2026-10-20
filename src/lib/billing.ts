import { computeInvoice, stayLines, type InvoiceTotals, type LineInput, type TaxContext } from "./core";
import type { Enums, Tables } from "./supabase/database.types";
import type { Messages } from "@/messages";

/**
 * Bills, as screens need them. The arithmetic is src/lib/core/tax.ts; the
 * database checks it again when a bill is issued (issue_invoice()).
 * Kept out of the "use server" files, which may export only async functions.
 */

export const PAYMENT_METHODS = ["upi", "cash", "card", "bank_transfer", "other"] as const satisfies readonly Enums<"payment_method">[];

type OrgTax = Pick<Tables<"organizations">, "tax_mode" | "gst_state_code" | "prices_include_tax" | "round_invoice_totals">;

/** How tax works for this kennel, for one bill. The place of supply is the kennel's state unless a bill says otherwise. */
export function taxContext(org: OrgTax, placeOfSupply?: string | null): TaxContext {
  return {
    mode: org.tax_mode,
    sellerStateCode: org.gst_state_code,
    placeOfSupplyStateCode: placeOfSupply ?? org.gst_state_code,
    pricesIncludeTax: org.prices_include_tax,
  };
}

export interface BillableBooking {
  kind: Enums<"booking_kind">;
  start_date: string;
  end_date: string;
  rate_minor: number;
  discount_minor: number;
  tax_rate_bp: number;
  sac_code: string | null;
}

export interface BillableItem {
  description: string;
  quantity: number;
  unit_price_minor: number;
  tax_rate_bp: number;
  sac_code: string | null;
}

/**
 * The bill a booking should get: its stay at the booked rate, discount and
 * tax, then each extra. Exactly what invoice_expected_lines() in the database
 * expects, so staff can issue it.
 */
export function billForBooking(org: OrgTax, petName: string, b: BillableBooking, items: readonly BillableItem[]): InvoiceTotals {
  const lines = stayLines({
    kind: b.kind,
    petName,
    startDate: b.start_date,
    endDate: b.end_date,
    rateMinor: b.rate_minor,
    discountMinor: b.discount_minor,
    taxRateBp: b.tax_rate_bp,
    sacCode: b.sac_code,
    addOns: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceMinor: i.unit_price_minor, taxRateBp: i.tax_rate_bp, sacCode: i.sac_code })),
  });
  return computeInvoice(lines, taxContext(org), { roundToWholeUnit: org.round_invoice_totals });
}

/**
 * The stays of a family booking that go on its bill: not requests, not
 * cancellations. Must match invoice_bookings() in the database.
 */
export const BILLABLE_IN_FAMILY = ["confirmed", "checked_in", "checked_out", "no_show"] as const satisfies readonly Enums<"booking_status">[];

export interface FamilyMember {
  petName: string;
  booking: BillableBooking;
  items: readonly BillableItem[];
}

/**
 * The bill for pets booked together: each pet's stay and then its extras, in
 * the order given, on one bill. An extra says whose it is. Exactly what
 * invoice_expected_lines() expects for the family, so staff can issue it.
 */
export function billForFamily(org: OrgTax, members: readonly FamilyMember[]): InvoiceTotals {
  const lines = members.flatMap(({ petName, booking: b, items }) =>
    stayLines({
      kind: b.kind,
      petName,
      startDate: b.start_date,
      endDate: b.end_date,
      rateMinor: b.rate_minor,
      discountMinor: b.discount_minor,
      taxRateBp: b.tax_rate_bp,
      sacCode: b.sac_code,
      addOns: items.map((i) => ({
        description: `${petName}: ${i.description}`.slice(0, 300),
        quantity: Number(i.quantity),
        unitPriceMinor: i.unit_price_minor,
        taxRateBp: i.tax_rate_bp,
        sacCode: i.sac_code,
      })),
    }),
  );
  return computeInvoice(lines, taxContext(org), { roundToWholeUnit: org.round_invoice_totals });
}

/** Recompute a bill from edited lines. */
export function billFromLines(org: OrgTax, lines: readonly LineInput[], placeOfSupply?: string | null): InvoiceTotals {
  return computeInvoice(lines, taxContext(org, placeOfSupply), { roundToWholeUnit: org.round_invoice_totals });
}

/** The arguments save_invoice_draft() takes. */
export function draftPayload(t: InvoiceTotals) {
  return {
    p_totals: {
      subtotal_minor: t.subtotalMinor,
      discount_minor: t.discountMinor,
      taxable_minor: t.taxableMinor,
      cgst_minor: t.cgstMinor,
      sgst_minor: t.sgstMinor,
      igst_minor: t.igstMinor,
      tax_minor: t.taxMinor,
      round_off_minor: t.roundOffMinor,
      total_minor: t.totalMinor,
    },
    p_lines: t.lines.map((l, i) => ({
      sort_order: i,
      description: l.description,
      sac_code: l.sacCode,
      quantity: l.quantity,
      unit_price_minor: l.unitPriceMinor,
      discount_minor: l.discountMinor,
      taxable_minor: l.taxableMinor,
      tax_rate_bp: l.taxRateBp,
      cgst_minor: l.cgstMinor,
      sgst_minor: l.sgstMinor,
      igst_minor: l.igstMinor,
      tax_minor: l.taxMinor,
      total_minor: l.totalMinor,
    })),
  };
}

/** The name of the tax on a bill: the kennel's own label in simple mode, otherwise "Tax" in the reader's words. */
export function taxLabel(m: Messages, mode: Enums<"tax_mode"> | string, label?: string | null): string {
  if (mode === "simple") return label?.trim() || m.labels.tax;
  return m.labels.tax;
}
