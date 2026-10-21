import { computeInvoice, stayLines, wholeStayCharge, type InvoiceTotals, type LineInput, type StayCharge, type TaxContext } from "./core";
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
  /** The first night of a stay that began as day boarding. */
  boarding_from?: string | null;
  /** The stay's lines from stay_charges() in the database. Without them, every night at rate_minor. */
  charges?: readonly StayCharge[];
  /** The day boarding pack it is paid from, if any. */
  pass_id?: string | null;
}

export interface BillableItem {
  description: string;
  quantity: number;
  unit_price_minor: number;
  tax_rate_bp: number;
  sac_code: string | null;
}

/**
 * The bill a booking should get: its stay (at the booked rate, or split as
 * stay_charges() says), discount and tax, then each extra. Exactly what invoice_expected_lines() in the database
 * expects, so staff can issue it.
 */
export function billForBooking(org: OrgTax, petName: string, b: BillableBooking, items: readonly BillableItem[]): InvoiceTotals {
  return computeInvoice(bookingLines(petName, b, items), taxContext(org), { roundToWholeUnit: org.round_invoice_totals });
}

/** The lines of a booking's bill, before tax is worked out: its stay, then each extra. */
export function bookingLines(petName: string, b: BillableBooking, items: readonly BillableItem[]): LineInput[] {
  return stayLines({
    kind: b.kind,
    petName,
    startDate: b.start_date,
    endDate: b.end_date,
    rateMinor: b.rate_minor,
    discountMinor: b.discount_minor,
    taxRateBp: b.tax_rate_bp,
    sacCode: b.sac_code,
    boardingFrom: b.boarding_from,
    charges: b.charges,
    fromPack: Boolean(b.pass_id),
    addOns: items.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceMinor: i.unit_price_minor, taxRateBp: i.tax_rate_bp, sacCode: i.sac_code })),
  });
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
  return computeInvoice(familyLines(members), taxContext(org), { roundToWholeUnit: org.round_invoice_totals });
}

/** The lines of a family's bill, before tax is worked out. */
export function familyLines(members: readonly FamilyMember[]): LineInput[] {
  return members.flatMap(({ petName, booking: b, items }) =>
    stayLines({
      kind: b.kind,
      petName,
      startDate: b.start_date,
      endDate: b.end_date,
      rateMinor: b.rate_minor,
      discountMinor: b.discount_minor,
      taxRateBp: b.tax_rate_bp,
      sacCode: b.sac_code,
      boardingFrom: b.boarding_from,
      charges: b.charges,
      fromPack: Boolean(b.pass_id),
      addOns: items.map((i) => ({
        description: `${petName}: ${i.description}`.slice(0, 300),
        quantity: Number(i.quantity),
        unitPriceMinor: i.unit_price_minor,
        taxRateBp: i.tax_rate_bp,
        sacCode: i.sac_code,
      })),
    }),
  );
}

/** A day of a repeating series, with its extras, for its month's bill. */
export interface SeriesDay {
  booking: BillableBooking;
  items: readonly BillableItem[];
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/**
 * The lines of the bill for one month of a repeating day boarding series
 * (D41): one line for each price, its days added up and listed, then each
 * day's extras with its date. Grouped exactly as invoice_expected_lines() in
 * the database groups a series (by price, tax rate and code), so staff can
 * issue it. Stored with the bill, so in English like the rest of its lines.
 */
export function seriesLines(petName: string, month: string, days: readonly SeriesDay[]): LineInput[] {
  const [year, monthNumber] = month.split("-").map(Number);
  const short = MONTHS[monthNumber - 1];
  const groups = new Map<string, { line: LineInput; dates: number[]; fromPack: boolean }>();
  const sorted = [...days].sort((a, b) => a.booking.start_date.localeCompare(b.booking.start_date));
  for (const { booking: b } of sorted) {
    const charges = b.charges ?? wholeStayCharge({ kind: b.kind, startDate: b.start_date, endDate: b.end_date, rateMinor: b.rate_minor, discountMinor: b.discount_minor });
    for (const c of charges) {
      const key = `${c.unitPriceMinor}|${b.tax_rate_bp}|${b.sac_code ?? ""}`;
      const group = groups.get(key) ?? {
        line: { description: "", quantity: 0, unitPriceMinor: c.unitPriceMinor, discountMinor: 0, taxRateBp: b.tax_rate_bp, sacCode: b.sac_code },
        dates: [],
        fromPack: true,
      };
      group.line = { ...group.line, quantity: group.line.quantity + c.quantity, discountMinor: (group.line.discountMinor ?? 0) + c.discountMinor };
      group.dates.push(Number(b.start_date.slice(8, 10)));
      group.fromPack &&= Boolean(b.pass_id);
      groups.set(key, group);
    }
  }
  const stays = [...groups.values()].map(({ line, dates, fromPack }) => {
    const n = line.quantity;
    const what = `${n} ${n === 1 ? "day" : "days"}${fromPack ? " from a pack" : ""}`;
    const list = [...new Set(dates)].join(", ");
    return { ...line, description: `Day boarding: ${petName}, ${what} in ${MONTHS_LONG[monthNumber - 1]} ${year} (${list} ${short})`.slice(0, 300) };
  });
  const extras = sorted.flatMap(({ booking: b, items }) =>
    items.map((i) => ({
      description: `${Number(b.start_date.slice(8, 10))} ${short}: ${i.description}`.slice(0, 300),
      quantity: Number(i.quantity),
      unitPriceMinor: i.unit_price_minor,
      taxRateBp: i.tax_rate_bp,
      sacCode: i.sac_code,
    })),
  );
  return [...stays, ...extras];
}

/** Work out a bill's totals from its lines, with the kennel's tax and rounding. */
export function billFor(org: OrgTax, lines: readonly LineInput[]): InvoiceTotals {
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

/** What a credit note needs to know of its bill: how tax worked on it when it was issued. */
export interface CreditableBill {
  is_tax_invoice: boolean;
  prices_include_tax: boolean;
  place_of_supply_state_code: string | null;
  /** The seller frozen on the bill: its tax mode and state. */
  seller: { tax_mode?: string | null; gst_state_code?: string | null } | null;
}

/**
 * How tax works on a credit note: exactly as on its bill when the bill was
 * issued, whatever the kennel's settings say now. Must match
 * issue_credit_note() in the database.
 */
export function creditContext(bill: CreditableBill): TaxContext {
  const mode = bill.is_tax_invoice ? bill.seller?.tax_mode : "none";
  return {
    mode: mode === "gst_india" || mode === "simple" ? mode : "none",
    sellerStateCode: bill.seller?.gst_state_code ?? null,
    placeOfSupplyStateCode: bill.place_of_supply_state_code ?? bill.seller?.gst_state_code ?? null,
    pricesIncludeTax: bill.prices_include_tax,
  };
}

/**
 * A credit note for part of a bill: one line of `amountMinor` at one of the
 * bill's tax rates. The amount is before tax when the bill's prices were, and
 * including tax when they included it.
 */
export function partCredit(
  bill: CreditableBill,
  line: { description: string; amountMinor: number; taxRateBp: number; sacCode: string | null },
  roundToWholeUnit: boolean,
): InvoiceTotals {
  return computeInvoice(
    [{ description: line.description, quantity: 1, unitPriceMinor: line.amountMinor, taxRateBp: line.taxRateBp, sacCode: line.sacCode }],
    creditContext(bill),
    { roundToWholeUnit },
  );
}

/** The arguments issue_credit_note() takes for the lines and totals of a credit note. */
export function creditPayload(t: InvoiceTotals) {
  const { p_totals, p_lines } = draftPayload(t);
  return { p_totals, p_lines };
}

/** A line of a bill or a credit note, as far as crediting the difference needs it. */
export interface MoneyLine {
  tax_rate_bp: number;
  taxable_minor: number;
  total_minor: number;
  sac_code: string | null;
}

/**
 * The credit note a bill needs after its stays changed (D40): a pet went home
 * early, a day was cancelled. For each tax rate on the bill, what it billed,
 * less what credit notes already took back, less what the stays now come to;
 * one line for each rate where that is more than nothing. Amounts are before
 * tax when the bill's prices were, and including tax when they included it,
 * as partCredit() takes them. Null when there is nothing to credit.
 * `now` is the stays' lines as they would be billed today, worked out under
 * the bill's own tax treatment (creditContext).
 */
export function differenceCredit(
  bill: CreditableBill,
  billed: readonly MoneyLine[],
  credited: readonly MoneyLine[],
  now: readonly MoneyLine[],
  description: string,
  roundToWholeUnit: boolean,
): InvoiceTotals | null {
  const gross = bill.is_tax_invoice && bill.prices_include_tax;
  const amount = (l: MoneyLine) => (gross ? l.total_minor : l.taxable_minor);
  const sum = (lines: readonly MoneyLine[], rate: number) => lines.filter((l) => l.tax_rate_bp === rate).reduce((a, l) => a + amount(l), 0);
  const rates = [...new Set(billed.map((l) => l.tax_rate_bp))].sort((a, b) => a - b);
  const lines: LineInput[] = rates.flatMap((rate) => {
    const left = sum(billed, rate) - sum(credited, rate) - sum(now, rate);
    if (left <= 0) return [];
    const sacCode = billed.find((l) => l.tax_rate_bp === rate && l.sac_code)?.sac_code ?? null;
    return [{ description: description.slice(0, 300), quantity: 1, unitPriceMinor: left, taxRateBp: rate, sacCode }];
  });
  if (lines.length === 0) return null;
  return computeInvoice(lines, creditContext(bill), { roundToWholeUnit });
}

/** Lines worked out by computeInvoice, as differenceCredit() takes them. */
export function moneyLines(t: InvoiceTotals): MoneyLine[] {
  return t.lines.map((l) => ({ tax_rate_bp: l.taxRateBp, taxable_minor: l.taxableMinor, total_minor: l.totalMinor, sac_code: l.sacCode ?? null }));
}

/**
 * Whether a bill's stays really changed since it was issued, so that the
 * difference is worth offering as a credit note (D40): every stay is now
 * cancelled, or the stays now have a line that is not on the bill as it
 * stands (a night fewer, a day cancelled). A line a manager added to the bill
 * by hand is not a change of stay, and is never offered back as one. Lines
 * are compared by what they charge, as issue_invoice() compares them.
 */
export function staysChanged(
  billed: readonly { quantity: number | string; unit_price_minor: number; discount_minor: number; tax_rate_bp: number }[],
  now: InvoiceTotals,
): boolean {
  if (now.lines.length === 0) return billed.length > 0;
  const key = (quantity: number, price: number, discount: number, rate: number) => `${quantity}|${price}|${discount}|${rate}`;
  const onBill = billed.map((l) => key(Number(l.quantity), l.unit_price_minor, l.discount_minor, l.tax_rate_bp));
  return now.lines.some((l) => {
    const at = onBill.indexOf(key(l.quantity, l.unitPriceMinor, l.discountMinor, l.taxRateBp));
    if (at === -1) return true;
    onBill.splice(at, 1);
    return false;
  });
}
