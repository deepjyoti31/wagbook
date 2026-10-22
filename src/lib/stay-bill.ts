import { BILLABLE_IN_FAMILY, bookingLines, creditContext, differenceCredit, familyLines, moneyLines, seriesLines, staysChanged, type CreditableBill } from "./billing";
import { appointmentLines, computeInvoice, toStayCharges, unpricedAppointments, type BillableAddOn, type BillableAppointment, type InvoiceTotals, type LineInput } from "./core";
import { foodLines } from "./food-bill";
import type { createClient } from "./supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * What a bill covers: one stay, a family booked together, one month of a
 * repeating day boarding series (D41), a week or month of a food
 * subscription, or one food order (M29). Must match invoice_bookings() and
 * food_bill_lines() in the database.
 */
export type BillScope =
  | { booking: string }
  | { group: string }
  | { series: string; month: string }
  | { subscription: string; from: string; to: string }
  | { delivery: string }
  | { appointment: string };

interface ScopeColumns {
  booking_id: string | null;
  group_id: string | null;
  series_id: string | null;
  series_month: string | null;
  subscription_id?: string | null;
  period_start?: string | null;
  period_end?: string | null;
  delivery_id?: string | null;
  appointment_id?: string | null;
}

/** The scope of a bill, from its row. Null for a one-off bill that covers no stay. */
export function scopeOf(inv: ScopeColumns): BillScope | null {
  if (inv.subscription_id && inv.period_start && inv.period_end) return { subscription: inv.subscription_id, from: inv.period_start, to: inv.period_end };
  if (inv.delivery_id) return { delivery: inv.delivery_id };
  if (inv.appointment_id) return { appointment: inv.appointment_id };
  if (inv.group_id) return { group: inv.group_id };
  if (inv.series_id && inv.series_month) return { series: inv.series_id, month: inv.series_month };
  if (inv.booking_id) return { booking: inv.booking_id };
  return null;
}

/** The first day of the month a date is in. */
export function monthOf(date: string): string {
  return `${date.slice(0, 7)}-01`;
}

const STAY = "id, client_id, kind, start_date, end_date, boarding_from, pass_id, rate_minor, discount_minor, tax_rate_bp, sac_code, status, created_at, pets(name), packages(name)" as const;

const APPOINTMENT = "id, booking_id, status, starts_at, price_minor, tax_rate_bp, sac_code, course_id, in_package, appointment_services(name), pets!appointments_org_id_client_id_pet_id_fkey(name)" as const;

/** A stay's or a visitor's appointments and their add-ons, as bills take them (M34). */
async function billableAppointments(supabase: Supabase, orgId: string, by: { bookings: string[] } | { appointment: string }) {
  let query = supabase.from("appointments").select(APPOINTMENT).eq("org_id", orgId);
  query = "bookings" in by ? query.in("booking_id", by.bookings) : query.eq("id", by.appointment);
  const rows = await query.order("starts_at");
  if (rows.error) return { error: rows.error };
  const ids = rows.data.map((a) => a.id);
  const items = ids.length
    ? await supabase.from("appointment_items").select("appointment_id, description, quantity, unit_price_minor, tax_rate_bp, sac_code").eq("org_id", orgId).in("appointment_id", ids).order("created_at")
    : { data: [], error: null };
  if (items.error) return { error: items.error };
  const appointments = rows.data.map(
    (a): BillableAppointment & { booking_id: string | null; pet_name: string } => ({
      ...a,
      service_name: a.appointment_services?.name ?? "Appointment",
      pet_name: a.pets?.name ?? "Pet",
    }),
  );
  return { appointments, addOns: items.data as BillableAddOn[] };
}

/** Thrown out of stayBillLines when an appointment on quote has no price yet, so no bill can be made. */
export const UNPRICED = { code: "unpriced", message: "An appointment on quote has no price yet." } as const;

/**
 * The stays a bill covers and the lines they come to today, before tax is
 * worked out: what Make bill writes on a draft, and what a bill whose stays
 * changed is compared with (differenceCredit). Requests and cancellations are
 * left out, so a cancelled stay comes to nothing.
 */
export async function stayBillLines(supabase: Supabase, orgId: string, scope: BillScope) {
  if ("subscription" in scope || "delivery" in scope) return foodBillLines(supabase, orgId, scope);
  const tz = await supabase.from("organizations").select("time_zone").eq("id", orgId).single();
  if (tz.error) return { error: tz.error };
  const timeZone = tz.data.time_zone;
  if ("appointment" in scope) {
    // A visitor's appointment and its add-ons (M34).
    const a = await billableAppointments(supabase, orgId, scope);
    if ("error" in a) return { error: a.error };
    if (unpricedAppointments(a.appointments).length) return { error: UNPRICED };
    const pet = a.appointments[0]?.pet_name ?? "Pet";
    return { stays: [] as { id: string }[], lines: appointmentLines(pet, a.appointments, a.addOns, timeZone) };
  }
  let query = supabase.from("bookings").select(STAY).eq("org_id", orgId).in("status", [...BILLABLE_IN_FAMILY]);
  if ("group" in scope) query = query.eq("group_id", scope.group);
  else if ("series" in scope) query = query.eq("series_id", scope.series).gte("start_date", scope.month).lt("start_date", nextMonth(scope.month));
  else query = query.eq("id", scope.booking);
  const stays = await query.order("start_date").order("created_at").order("id");
  if (stays.error) return { error: stays.error };
  if (stays.data.length === 0) return { stays: stays.data, lines: [] as LineInput[] };

  const ids = stays.data.map((b) => b.id);
  const [items, charges, appts] = await Promise.all([
    // A package's own extras are in its price, not lines of their own (M37).
    supabase.from("booking_items").select("booking_id, description, quantity, unit_price_minor, tax_rate_bp, sac_code").eq("org_id", orgId).in("booking_id", ids).eq("in_package", false).order("created_at"),
    // What each stay costs: split where a pet had its shared kennel to itself, or turned from day boarding into boarding.
    supabase.rpc("stay_charges", { p_org: orgId, p_bookings: ids }),
    billableAppointments(supabase, orgId, { bookings: ids }),
  ]);
  if (items.error || charges.error) return { error: items.error ?? charges.error };
  if ("error" in appts) return { error: appts.error };
  if (unpricedAppointments(appts.appointments).length) return { error: UNPRICED };
  const billable = stays.data.map((b) => ({ ...b, package_name: b.packages?.name ?? null, charges: toStayCharges(charges.data.filter((c) => c.booking_id === b.id)) }));
  const itemsOf = (id: string) => items.data.filter((i) => i.booking_id === id);
  // Each stay's appointments, after its stay and extras (M34).
  const appointmentsOf = (id: string, petName: string) => {
    const mine = appts.appointments.filter((a) => a.booking_id === id);
    return appointmentLines(petName, mine, appts.addOns.filter((x) => mine.some((a) => a.id === x.appointment_id)), timeZone);
  };
  // The pet's name goes into the stored line description; a booking always has a pet, so the fallback is never seen.
  const name = (b: (typeof billable)[number]) => b.pets?.name ?? "Pet";

  let lines: LineInput[];
  if ("series" in scope) {
    lines = [
      ...seriesLines(name(billable[0]), scope.month, billable.map((b) => ({ booking: b, items: itemsOf(b.id) }))),
      ...billable.flatMap((b) => appointmentsOf(b.id, name(b))),
    ];
  } else if ("group" in scope) {
    // A family's pets in the order they were booked.
    const family = [...billable].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
    lines = [...familyLines(family.map((b) => ({ petName: name(b), booking: b, items: itemsOf(b.id) }))), ...family.flatMap((b) => appointmentsOf(b.id, name(b)))];
  } else {
    lines = [...bookingLines(name(billable[0]), billable[0], itemsOf(billable[0].id)), ...appointmentsOf(billable[0].id, name(billable[0]))];
  }
  return { stays: stays.data, lines };
}

const DELIVERY = "kind, status, delivery_date, grams, quantity, unit_price_minor, delivery_charge_minor, tax_rate_bp, sac_code, pets(name), food_products(name), subscriptions(pay_period)" as const;

/**
 * The deliveries a food bill covers and the lines they come to today: what
 * Make bill writes on a draft for a subscription's week or month or for an
 * order, and what a bill whose deliveries changed is compared with. A
 * cancelled delivery comes to nothing.
 */
export async function foodBillLines(supabase: Supabase, orgId: string, scope: { subscription: string; from: string; to: string } | { delivery: string }) {
  let query = supabase.from("deliveries").select(DELIVERY).eq("org_id", orgId);
  query = "subscription" in scope ? query.eq("subscription_id", scope.subscription).gte("delivery_date", scope.from).lte("delivery_date", scope.to) : query.eq("id", scope.delivery);
  const [deliveries, org] = await Promise.all([
    query.order("delivery_date").order("created_at"),
    supabase.from("organizations").select("monthly_food_discount_bp").eq("id", orgId).single(),
  ]);
  if (deliveries.error || org.error) return { error: deliveries.error ?? org.error };
  const monthly = deliveries.data.some((d) => d.subscriptions?.pay_period === "month");
  const pet = deliveries.data[0]?.pets?.name ?? "Pet";
  const lines = foodLines(
    pet,
    deliveries.data.map((d) => ({ ...d, product_name: d.food_products?.name ?? null })),
    monthly ? org.data.monthly_food_discount_bp : 0,
  );
  return { stays: [] as { id: string }[], lines };
}

/** The first day of the month after `month` (itself a first day). */
export function nextMonth(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return m === 12 ? `${y + 1}-01-01` : `${y}-${String(m + 1).padStart(2, "0")}-01`;
}

/** An issued bill, as far as crediting it for a change to its stays needs it. */
export interface ChangedBill extends ScopeColumns {
  id: string;
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
