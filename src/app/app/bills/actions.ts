"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { billFor, billFromLines, creditPayload, draftPayload, partCredit, PAYMENT_METHODS, type CreditableBill } from "@/lib/billing";
import { isISODate, parseMoney, todayIn, type LineInput } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { creditForChange, monthOf, stayBillLines, type BillScope } from "@/lib/stay-bill";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Make the bill for a booking, or bring an existing draft back in line with
 * the booking. A stay has one live bill at a time (the database insists), so
 * an issued bill is simply opened. Pets booked together are billed together:
 * the family's bill has every pet that is not a request or cancelled. A day
 * of a repeating series is billed with the other days of its month (D41).
 */
export async function makeBill(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: t.m.errors.bookingNotFound };
  const supabase = await createClient();

  const booking = await supabase.from("bookings").select("id, client_id, group_id, series_id, start_date").eq("org_id", org.id).eq("id", bookingId.data).maybeSingle();
  if (booking.error) return { error: friendlyError(booking.error, t) };
  if (!booking.data) return { error: t.m.errors.bookingNotFound };
  const b = booking.data;
  const scope: BillScope = b.group_id ? { group: b.group_id } : b.series_id ? { series: b.series_id, month: monthOf(b.start_date) } : { booking: b.id };

  // The stays this bill covers, and what they come to.
  const built = await stayBillLines(supabase, org.id, scope);
  if ("error" in built) return { error: friendlyError(built.error, t) };
  if (built.lines.length === 0) return { error: t.m.bill.errors.nothingToBill };

  let existingQuery = supabase.from("invoices").select("id, status").eq("org_id", org.id).neq("status", "void");
  if ("group" in scope) existingQuery = existingQuery.eq("group_id", scope.group);
  else if ("series" in scope) existingQuery = existingQuery.eq("series_id", scope.series).eq("series_month", scope.month);
  else existingQuery = existingQuery.eq("booking_id", scope.booking);
  const existing = await existingQuery.maybeSingle();
  if (existing.error) return { error: friendlyError(existing.error, t) };
  if (existing.data?.status === "issued") redirect(`/app/bills/${existing.data.id}`);

  const totals = billFor(org, built.lines);
  let invoiceId = existing.data?.id;
  if (!invoiceId) {
    const created = await supabase
      .from("invoices")
      .insert({
        org_id: org.id,
        client_id: b.client_id,
        booking_id: "booking" in scope ? scope.booking : null,
        group_id: "group" in scope ? scope.group : null,
        series_id: "series" in scope ? scope.series : null,
        series_month: "series" in scope ? scope.month : null,
      })
      .select("id")
      .single();
    if (created.error) return { error: friendlyError(created.error, t) };
    invoiceId = created.data.id;
  }
  const saved = await supabase.rpc("save_invoice_draft", { p_invoice: invoiceId, ...draftPayload(totals) });
  if (saved.error) return { error: friendlyError(saved.error, t) };

  revalidatePath("/app", "layout");
  redirect(`/app/bills/${invoiceId}`);
}

/** Read a draft's lines back as inputs, so one can be changed and the whole bill worked out again. */
async function draftLines(supabase: Supabase, orgId: string, invoiceId: string) {
  const [inv, lines] = await Promise.all([
    supabase.from("invoices").select("id, status, place_of_supply_state_code").eq("org_id", orgId).eq("id", invoiceId).maybeSingle(),
    supabase
      .from("invoice_lines")
      .select("description, sac_code, quantity, unit_price_minor, discount_minor, tax_rate_bp")
      .eq("org_id", orgId)
      .eq("invoice_id", invoiceId)
      .order("sort_order"),
  ]);
  if (inv.error || lines.error || !inv.data) return null;
  return {
    invoice: inv.data,
    lines: lines.data.map(
      (l): LineInput => ({
        description: l.description,
        sacCode: l.sac_code,
        quantity: Number(l.quantity),
        unitPriceMinor: l.unit_price_minor,
        discountMinor: l.discount_minor,
        taxRateBp: l.tax_rate_bp,
      }),
    ),
  };
}

const quantityText = /^\d{1,6}(\.\d{1,2})?$/;

/**
 * Change, add or remove a line of a draft, then work out the whole bill again.
 * Owners and managers: staff issue bills exactly as the booking prices them
 * (the database refuses anything else, WB050).
 */
export async function editLine(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.bill.errors;
  if (!canManage) return { error: t.m.bill.managersOnly };
  const invoiceId = Id.safeParse(form.get("invoiceId"));
  if (!invoiceId.success) return { error: t.m.errors.billNotFound };
  const supabase = await createClient();
  const draft = await draftLines(supabase, org.id, invoiceId.data);
  if (!draft) return { error: t.m.errors.billNotFound };
  if (draft.invoice.status !== "draft") return { error: e.onlyDraftChanged };

  // Which line: its position, or none for a new line.
  const indexText = text(form, "index");
  const index = indexText === null ? -1 : Number(indexText);
  const lines = [...draft.lines];
  if (form.get("intent") === "remove") {
    if (!Number.isInteger(index) || !lines[index]) return { error: e.lineNotFound };
    if (lines.length === 1) return { error: e.needsLine };
    lines.splice(index, 1);
  } else {
    const description = text(form, "description");
    const qty = text(form, "quantity") ?? "1";
    const price = parseMoney(text(form, "price") ?? "");
    const discountText = text(form, "discount");
    const discount = discountText === null ? 0 : parseMoney(discountText);
    if (!description || description.length > 300) return { error: e.describeLine };
    if (!quantityText.test(qty) || Number(qty) <= 0) return { error: e.quantity };
    if (price === null || price < 0) return { error: e.price };
    if (discount === null || discount < 0) return { error: e.discount };
    const line: LineInput = {
      description,
      quantity: Number(qty),
      unitPriceMinor: price,
      discountMinor: discount,
      taxRateBp: Number.isInteger(index) && lines[index] ? lines[index].taxRateBp : org.default_tax_rate_bp,
      sacCode: Number.isInteger(index) && lines[index] ? lines[index].sacCode : null,
    };
    if (Math.round(line.unitPriceMinor * line.quantity) < discount) return { error: e.discountTooBig };
    if (Number.isInteger(index) && index >= 0 && lines[index]) lines[index] = line;
    else lines.push(line);
  }

  const totals = billFromLines(org, lines, draft.invoice.place_of_supply_state_code);
  const saved = await supabase.rpc("save_invoice_draft", { p_invoice: invoiceId.data, ...draftPayload(totals) });
  if (saved.error) return { error: friendlyError(saved.error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.bill.updated };
}

/** Give the bill its number and freeze it. The database checks every sum first. */
export async function issueBill(_state: FormState, form: FormData): Promise<FormState> {
  await requireOrg();
  const t = await getAppI18n();
  const invoiceId = Id.safeParse(form.get("invoiceId"));
  if (!invoiceId.success) return { error: t.m.errors.billNotFound };
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_invoice", { p_invoice: invoiceId.data });
  if (error) {
    // WB037 means the app's sums and the database's disagree: a bug, never the person's fault.
    if (error.message.includes("WB037")) console.error("issue_invoice refused the app's arithmetic", invoiceId.data, error.message);
    return { error: error.message.includes("WB037") ? t.m.bill.errors.doesNotAddUp : friendlyError(error, t) };
  }
  revalidatePath("/app", "layout");
  redirect(`/app/bills/${invoiceId.data}?done=issued`);
}

/** Cancel an issued bill. Owners and managers, with a reason. The number stays used. */
export async function voidBill(_state: FormState, form: FormData): Promise<FormState> {
  const { canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.bill.errors;
  if (!canManage) return { error: e.cancelManagers };
  const invoiceId = Id.safeParse(form.get("invoiceId"));
  const reason = text(form, "reason");
  if (!invoiceId.success) return { error: t.m.errors.billNotFound };
  if (!reason) return { error: e.sayWhy };
  if (reason.length > 500) return { error: e.reasonTooLong };
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_invoice", { p_invoice: invoiceId.data, p_reason: reason });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/bills/${invoiceId.data}?done=void`);
}

/**
 * Take back all or part of an issued bill with a credit note (D34). Owners
 * and managers; the database checks again (issue_credit_note: WB002, WB092,
 * WB093). The whole bill, while nothing has been credited, copies the bill's
 * own lines, so every paisa matches. Part of it is one line, of the amount
 * typed, at one of the bill's tax rates. The difference (D40) is what the
 * bill's stays no longer come to, worked out here again, never taken from the
 * form: one line for each tax rate.
 */
export async function creditBill(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.bill.errors;
  if (!canManage) return { error: t.m.errors.codes.WB002 };
  const invoiceId = Id.safeParse(form.get("invoiceId"));
  if (!invoiceId.success) return { error: t.m.errors.billNotFound };
  const reason = text(form, "reason");
  if (!reason) return { error: e.creditWhy };
  if (reason.length > 500) return { error: e.reasonTooLong };
  let whole = form.get("how") === "whole";
  const difference = form.get("how") === "difference";

  const supabase = await createClient();
  const [bill, lines, balance] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, number, status, booking_id, group_id, series_id, series_month, subscription_id, period_start, period_end, delivery_id, is_tax_invoice, prices_include_tax, place_of_supply_state_code, seller, taxable_minor, total_minor")
      .eq("org_id", org.id)
      .eq("id", invoiceId.data)
      .maybeSingle(),
    supabase
      .from("invoice_lines")
      .select("description, sac_code, quantity, unit_price_minor, discount_minor, taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, igst_minor, tax_minor, total_minor, sort_order")
      .eq("org_id", org.id)
      .eq("invoice_id", invoiceId.data)
      .order("sort_order"),
    supabase.from("invoice_balances").select("credited_minor").eq("org_id", org.id).eq("invoice_id", invoiceId.data).maybeSingle(),
  ]);
  if (bill.error || lines.error || balance.error) return { error: friendlyError(bill.error ?? lines.error ?? balance.error, t) };
  if (!bill.data || lines.data.length === 0) return { error: t.m.errors.billNotFound };
  const b = bill.data;
  const creditable: CreditableBill = { ...b, seller: (b.seller ?? null) as CreditableBill["seller"] };
  const what = text(form, "description") ?? fill(t.m.bill.credit.whatDefault, { number: b.number ?? "" });
  const rates = [...new Set(lines.data.map((l) => l.tax_rate_bp))];

  let changed: ReturnType<typeof creditPayload> | null = null;
  if (difference) {
    const change = await creditForChange(supabase, org.id, b, what, org.round_invoice_totals);
    if ("error" in change) return { error: friendlyError(change.error, t) };
    if (!change.credit) return { error: e.nothingChanged };
    // Nothing left to bill and nothing credited yet: the whole bill, with its own lines.
    if (change.whole) whole = true;
    else changed = creditPayload(change.credit);
  }

  let payload: ReturnType<typeof creditPayload>;
  if (changed) {
    payload = changed;
  } else if (whole && (balance.data?.credited_minor ?? 0) === 0) {
    // The bill's own lines, exactly as they were issued.
    payload = {
      p_totals: {
        subtotal_minor: 0, discount_minor: lines.data.reduce((a, l) => a + l.discount_minor, 0), taxable_minor: b.taxable_minor,
        cgst_minor: lines.data.reduce((a, l) => a + l.cgst_minor, 0), sgst_minor: lines.data.reduce((a, l) => a + l.sgst_minor, 0),
        igst_minor: lines.data.reduce((a, l) => a + l.igst_minor, 0), tax_minor: lines.data.reduce((a, l) => a + l.tax_minor, 0),
        round_off_minor: b.total_minor - lines.data.reduce((a, l) => a + l.taxable_minor + l.tax_minor, 0), total_minor: b.total_minor,
      },
      p_lines: lines.data.map((l, i) => ({ ...l, quantity: Number(l.quantity), sort_order: i })),
    };
  } else {
    // The whole bill is offered only while nothing has been credited; after that, part of it.
    const rate = Number(form.get("rate") ?? rates[0]);
    const amount = parseMoney(text(form, "amount") ?? "");
    if (!rates.includes(rate)) return { error: e.creditRate };
    if (amount === null || amount <= 0) return { error: e.creditAmount };
    const sac = lines.data.find((l) => l.tax_rate_bp === rate && l.sac_code)?.sac_code ?? null;
    payload = creditPayload(partCredit(creditable, { description: what.slice(0, 300), amountMinor: amount, taxRateBp: rate, sacCode: sac }, org.round_invoice_totals));
  }

  const { error } = await supabase.rpc("issue_credit_note", { p_invoice: b.id, p_reason: reason, ...payload });
  if (error) {
    if (error.message.includes("WB037")) console.error("issue_credit_note refused the app's arithmetic", b.id, error.message);
    return { error: error.message.includes("WB037") ? e.doesNotAddUp : friendlyError(error, t) };
  }
  revalidatePath("/app", "layout");
  redirect(`/app/bills/${b.id}?done=credited`);
}

/** Throw away a draft. Owners only (the delete policy, D29). */
export async function deleteDraft(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete } = await requireOrg();
  const t = await getAppI18n();
  if (!canDelete) return { error: t.m.errors.ownersDelete };
  const invoiceId = Id.safeParse(form.get("invoiceId"));
  if (!invoiceId.success) return { error: t.m.errors.billNotFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").delete().eq("org_id", org.id).eq("id", invoiceId.data).eq("status", "draft").select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.bill.errors.onlyDraftDeleted };
  revalidatePath("/app", "layout");
  redirect("/app/bills");
}

/**
 * Record money that moved: against a bill, or as an advance on a booking.
 * A refund (money going back) is for owners and managers. Wagbook never marks
 * anything paid by itself: this is the only way.
 */
export async function recordPayment(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.payments;
  const invoiceText = text(form, "invoiceId");
  const bookingText = text(form, "bookingId");
  const invoiceId = invoiceText ? Id.safeParse(invoiceText) : null;
  const bookingId = bookingText ? Id.safeParse(bookingText) : null;
  if ((invoiceId && !invoiceId.success) || (bookingId && !bookingId.success) || (!invoiceId && !bookingId)) return { error: t.m.errors.billNotFound };
  const refund = form.get("direction") === "out";
  if (refund && !canManage) return { error: w.errors.refundManagers };

  const Payment = z.object({
    amount: z.number().int().positive(w.errors.amount),
    method: z.enum(PAYMENT_METHODS, w.errors.method),
    receivedOn: z.string().refine(isISODate, w.errors.date),
    reference: z.string().max(100, w.errors.reference).nullable(),
    note: z.string().max(500, w.errors.note).nullable(),
  });
  const parsed = Payment.safeParse({
    amount: parseMoney(text(form, "amount") ?? "") ?? 0,
    method: form.get("method"),
    receivedOn: text(form, "receivedOn") ?? todayIn(org.time_zone),
    reference: text(form, "reference"),
    note: text(form, "note"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const p = parsed.data;

  const supabase = await createClient();
  // The parent, and the booking, come from the bill or the booking itself, read through our own session.
  let clientId: string;
  let linkedBooking: string | null = bookingId?.success ? bookingId.data : null;
  if (invoiceId?.success) {
    const inv = await supabase.from("invoices").select("client_id, booking_id, status").eq("org_id", org.id).eq("id", invoiceId.data).maybeSingle();
    if (inv.error || !inv.data) return { error: t.m.errors.billNotFound };
    if (inv.data.status !== "issued") return { error: w.errors.issuedOnly };
    clientId = inv.data.client_id;
    linkedBooking = inv.data.booking_id;
  } else {
    const b = await supabase.from("bookings").select("client_id").eq("org_id", org.id).eq("id", linkedBooking!).maybeSingle();
    if (b.error || !b.data) return { error: t.m.errors.bookingNotFound };
    clientId = b.data.client_id;
  }

  const { error } = await supabase.from("payments").insert({
    org_id: org.id,
    client_id: clientId,
    booking_id: linkedBooking,
    invoice_id: invoiceId?.success ? invoiceId.data : null,
    direction: refund ? "out" : "in",
    amount_minor: p.amount,
    method: p.method,
    received_on: p.receivedOn,
    reference: p.reference,
    note: p.note,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: refund ? w.refundRecorded : invoiceId ? w.paymentRecorded : w.advanceRecorded };
}
