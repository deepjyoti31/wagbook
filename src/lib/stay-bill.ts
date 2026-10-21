import { BILLABLE_IN_FAMILY, bookingLines, creditContext, differenceCredit, familyLines, moneyLines, seriesLines, staysChanged, type CreditableBill } from "./billing";
import { computeInvoice, toStayCharges, type InvoiceTotals, type LineInput } from "./core";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * What a bill covers: one stay, a family booked together, or one month of a
 * repeating day boarding series (D41). Must match invoice_bookings() in the
 * database.
 */
export type BillScope = { booking: string } | { group: string } | { series: string; month: string };

/** The scope of a bill, from its row. Null for a one-off bill that covers no stay. */
export function scopeOf(inv: { booking_id: string | null; group_id: string | null; series_id: string | null; series_month: string | null }): BillScope | null {
  if (inv.group_id) return { group: inv.group_id };
  if (inv.series_id && inv.series_month) return { series: inv.series_id, month: inv.series_month };
  if (inv.booking_id) return { booking: inv.booking_id };
  return null;
}

/** The first day of the month a date is in. */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

const STAY = "id, client_id, kind, start_date, end_date, boarding_from, pass_id, rate_minor, discount_minor, tax_rate_bp, sac_code, status, created_at, pets(name)" as const;

/**
 * The stays a bill covers and the lines they come to today, before tax is
 * worked out: what Make bill writes on a draft, and what a bill whose stays
 * changed is compared with (differenceCredit). Requests and cancellations are
 * left out, so a cancelled stay comes to nothing.
 */
export async function stayBillLines(supabase: Supabase, orgId: string, scope: BillScope) {
  let query = supabase.from("bookings").select(STAY).eq("org_id", orgId).in("status", [...BILLABLE_IN_FAMILY]);
  if ("group" in scope) query = query.eq("group_id", scope.group);
  else if ("series" in scope) query = query.eq("series_id", scope.series).gte("start_date", scope.month).lt("start_date", nextMonth(scope.month));
  else query = query.eq("id", scope.booking);
  const stays = await query.order("start_date").order("created_at").order("id");
  if (stays.error) return { error: stays.error };
  if (stays.data.length === 0) return { stays: stays.data, lines: [] as LineInput[] };

  const ids = stays.data.map((b) => b.id);
  const [items, charges] = await Promise.all([
    supabase.from("booking_items").select("booking_id, description, quantity, unit_price_minor, tax_rate_bp, sac_code").eq("org_id", orgId).in("booking_id", ids).order("created_at"),
    // What each stay costs: split where a pet had its shared kennel to itself, or turned from day boarding into boarding.
    supabase.rpc("stay_charges", { p_org: orgId, p_bookings: ids }),
  ]);
  if (items.error || charges.error) return { error: items.error ?? charges.error };
  const billable = stays.data.map((b) => ({ ...b, charges: toStayCharges(charges.data.filter((c) => c.booking_id === b.id)) }));
  const itemsOf = (id: string) => items.data.filter((i) => i.booking_id === id);
  // The pet's name goes into the stored line description; a booking always has a pet, so the fallback is never seen.
  const name = (b: (typeof billable)[number]) => b.pets?.name ?? "Pet";

  let lines: LineInput[];
  if ("series" in scope) {
    lines = seriesLines(name(billable[0]), scope.month, billable.map((b) => ({ booking: b, items: itemsOf(b.id) })));
  } else if ("group" in scope) {
    // A family's pets in the order they were booked.
    const family = [...billable].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    lines = familyLines(family.map((b) => ({ petName: name(b), booking: b, items: itemsOf(b.id) })));
  } else {
    lines = bookingLines(name(billable[0]), billable[0], itemsOf(billable[0].id));
  }
  return { stays: stays.data, lines };
}

/** The first day of the month after `month` (itself a first day). */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** An issued bill, as far as crediting it for a change to its stays needs it. */
export interface ChangedBill {
  id: string;
  booking_id: string | null;
  group_id: string | null;
  series_id: string | null;
  series_month: string | null;
  is_tax_invoice: boolean;
  prices_include_tax: boolean;
  place_of_supply_state_code: string | null;
  seller: unknown;
}

/**
 * What an issued bill's stays come to now, and the credit note that would
 * bring the bill down to it (D40): a pet went home early and was billed only
 * to today, a stay or a day was cancelled. `credit` is null when nothing is
 * left to credit. `whole` is true when the stays now come to nothing and
 * nothing has been credited yet, so the whole bill can be credited with its
 * own lines, to the paisa.
 */
export async function creditForChange(supabase: Supabase, orgId: string, bill: ChangedBill, description: string, roundToWholeUnit: boolean) {
  const scope = scopeOf(bill);
  if (!scope) return { credit: null, whole: false, now: null };
  const [now, billed, notes] = await Promise.all([
    stayBillLines(supabase, orgId, scope),
    supabase.from("invoice_lines").select("quantity, unit_price_minor, discount_minor, tax_rate_bp, taxable_minor, total_minor, sac_code").eq("org_id", orgId).eq("invoice_id", bill.id),
    supabase.from("credit_notes").select("id").eq("org_id", orgId).eq("invoice_id", bill.id),
  ]);
  if ("error" in now || billed.error || notes.error) return { error: ("error" in now ? now.error : null) ?? billed.error ?? notes.error };
  const credited =
    notes.data.length > 0
      ? await supabase.from("credit_note_lines").select("tax_rate_bp, taxable_minor, total_minor, sac_code").eq("org_id", orgId).in("credit_note_id", notes.data.map((n) => n.id))
      : { data: [], error: null };
  if (credited.error) return { error: credited.error };
  const creditable: CreditableBill = { ...bill, seller: (bill.seller ?? null) as CreditableBill["seller"] };
  // The stays as they would be billed today, under the bill's own tax treatment.
  const nowTotals: InvoiceTotals = computeInvoice(now.lines, creditContext(creditable), { roundToWholeUnit });
  const credit = staysChanged(billed.data, nowTotals) ? differenceCredit(creditable, billed.data, credited.data ?? [], moneyLines(nowTotals), description, roundToWholeUnit) : null;
  return { credit, whole: credit !== null && now.lines.length === 0 && notes.data.length === 0, now: nowTotals };
}
