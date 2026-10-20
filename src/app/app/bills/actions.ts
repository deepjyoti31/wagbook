"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { BILLABLE_IN_FAMILY, billForBooking, billForFamily, billFromLines, draftPayload, PAYMENT_METHODS } from "@/lib/billing";
import { isISODate, parseMoney, todayIn, type LineInput } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Make the bill for a booking, or bring an existing draft back in line with
 * the booking. A stay has one live bill at a time (the database insists), so
 * an issued bill is simply opened. Pets booked together are billed together:
 * the family's bill has every pet that is not a request or cancelled.
 */
export async function makeBill(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: t.m.errors.bookingNotFound };
  const supabase = await createClient();

  const booking = await supabase.from("bookings").select("id, client_id, group_id, status").eq("org_id", org.id).eq("id", bookingId.data).maybeSingle();
  if (booking.error) return { error: friendlyError(booking.error, t) };
  if (!booking.data) return { error: t.m.errors.bookingNotFound };
  const group = booking.data.group_id;

  // The stays this bill covers: the booking, or its family.
  const stays = await supabase
    .from("bookings")
    .select("id, client_id, kind, start_date, end_date, rate_minor, discount_minor, tax_rate_bp, sac_code, status, created_at, pets(name)")
    .eq("org_id", org.id)
    .in(group ? "group_id" : "id", [group ?? booking.data.id])
    .in("status", group ? [...BILLABLE_IN_FAMILY] : ["confirmed", "checked_in", "checked_out", "no_show"])
    .order("created_at")
    .order("id");
  if (stays.error) return { error: friendlyError(stays.error, t) };
  if (stays.data.length === 0) return { error: t.m.bill.errors.nothingToBill };

  const [items, existing] = await Promise.all([
    supabase
      .from("booking_items")
      .select("booking_id, description, quantity, unit_price_minor, tax_rate_bp, sac_code")
      .eq("org_id", org.id)
      .in("booking_id", stays.data.map((b) => b.id))
      .order("created_at"),
    supabase
      .from("invoices")
      .select("id, status")
      .eq("org_id", org.id)
      .eq(group ? "group_id" : "booking_id", group ?? booking.data.id)
      .neq("status", "void")
      .maybeSingle(),
  ]);
  if (items.error || existing.error) return { error: friendlyError(items.error ?? existing.error, t) };
  if (existing.data?.status === "issued") redirect(`/app/bills/${existing.data.id}`);

  // The pet's name goes into the stored line description; a booking always has a pet, so the fallback is never seen.
  const totals = group
    ? billForFamily(
        org,
        stays.data.map((b) => ({ petName: b.pets?.name ?? "Pet", booking: b, items: items.data.filter((i) => i.booking_id === b.id) })),
      )
    : billForBooking(org, stays.data[0].pets?.name ?? "Pet", stays.data[0], items.data);
  let invoiceId = existing.data?.id;
  if (!invoiceId) {
    const created = await supabase
      .from("invoices")
      .insert({ org_id: org.id, client_id: booking.data.client_id, booking_id: group ? null : booking.data.id, group_id: group })
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
