"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { billForBooking, billFromLines, draftPayload, PAYMENT_METHODS } from "@/lib/billing";
import { isISODate, parseMoney, todayIn, type LineInput } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Make the bill for a booking, or bring an existing draft back in line with
 * the booking. A stay has one live bill at a time (the database insists), so
 * an issued bill is simply opened.
 */
export async function makeBill(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: "That booking could not be found." };
  const supabase = await createClient();

  const [booking, items, existing] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, client_id, kind, start_date, end_date, rate_minor, discount_minor, tax_rate_bp, sac_code, status, pets(name)")
      .eq("org_id", org.id)
      .eq("id", bookingId.data)
      .maybeSingle(),
    supabase.from("booking_items").select("description, quantity, unit_price_minor, tax_rate_bp, sac_code").eq("org_id", org.id).eq("booking_id", bookingId.data).order("created_at"),
    supabase.from("invoices").select("id, status").eq("org_id", org.id).eq("booking_id", bookingId.data).neq("status", "void").maybeSingle(),
  ]);
  if (booking.error || items.error || existing.error) return { error: friendlyError(booking.error ?? items.error ?? existing.error) };
  if (!booking.data) return { error: "That booking could not be found." };
  if (booking.data.status === "cancelled" || booking.data.status === "requested") return { error: "A cancelled booking or a request has nothing to bill." };
  if (existing.data?.status === "issued") redirect(`/app/bills/${existing.data.id}`);

  const totals = billForBooking(org, booking.data.pets?.name ?? "Pet", booking.data, items.data);
  let invoiceId = existing.data?.id;
  if (!invoiceId) {
    const created = await supabase
      .from("invoices")
      .insert({ org_id: org.id, client_id: booking.data.client_id, booking_id: booking.data.id })
      .select("id")
      .single();
    if (created.error) return { error: friendlyError(created.error) };
    invoiceId = created.data.id;
  }
  const saved = await supabase.rpc("save_invoice_draft", { p_invoice: invoiceId, ...draftPayload(totals) });
  if (saved.error) return { error: friendlyError(saved.error) };

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
  if (!canManage) return { error: "Only an owner or manager can change what a bill charges." };
  const invoiceId = Id.safeParse(form.get("invoiceId"));
  if (!invoiceId.success) return { error: "That bill could not be found." };
  const supabase = await createClient();
  const draft = await draftLines(supabase, org.id, invoiceId.data);
  if (!draft) return { error: "That bill could not be found." };
  if (draft.invoice.status !== "draft") return { error: "Only a draft bill can be changed. Cancel it and make a new one." };

  // Which line: its position, or none for a new line.
  const indexText = text(form, "index");
  const index = indexText === null ? -1 : Number(indexText);
  const lines = [...draft.lines];
  if (form.get("intent") === "remove") {
    if (!Number.isInteger(index) || !lines[index]) return { error: "That line could not be found." };
    if (lines.length === 1) return { error: "A bill needs at least one line." };
    lines.splice(index, 1);
  } else {
    const description = text(form, "description");
    const qty = text(form, "quantity") ?? "1";
    const price = parseMoney(text(form, "price") ?? "");
    const discountText = text(form, "discount");
    const discount = discountText === null ? 0 : parseMoney(discountText);
    if (!description || description.length > 300) return { error: "Describe the line in up to 300 characters." };
    if (!quantityText.test(qty) || Number(qty) <= 0) return { error: "Enter how many, like 1 or 2.5." };
    if (price === null || price < 0) return { error: "Enter the price as a number, like 1200." };
    if (discount === null || discount < 0) return { error: "Enter the discount as a number, or leave it empty." };
    const line: LineInput = {
      description,
      quantity: Number(qty),
      unitPriceMinor: price,
      discountMinor: discount,
      taxRateBp: Number.isInteger(index) && lines[index] ? lines[index].taxRateBp : org.default_tax_rate_bp,
      sacCode: Number.isInteger(index) && lines[index] ? lines[index].sacCode : null,
    };
    if (Math.round(line.unitPriceMinor * line.quantity) < discount) return { error: "The discount is more than the line." };
    if (Number.isInteger(index) && index >= 0 && lines[index]) lines[index] = line;
    else lines.push(line);
  }

  const totals = billFromLines(org, lines, draft.invoice.place_of_supply_state_code);
  const saved = await supabase.rpc("save_invoice_draft", { p_invoice: invoiceId.data, ...draftPayload(totals) });
  if (saved.error) return { error: friendlyError(saved.error) };
  revalidatePath("/app", "layout");
  return { ok: "Bill updated." };
}

/** Give the bill its number and freeze it. The database checks every sum first. */
export async function issueBill(_state: FormState, form: FormData): Promise<FormState> {
  await requireOrg();
  const invoiceId = Id.safeParse(form.get("invoiceId"));
  if (!invoiceId.success) return { error: "That bill could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("issue_invoice", { p_invoice: invoiceId.data });
  if (error) {
    // WB037 means the app's sums and the database's disagree: a bug, never the person's fault.
    if (error.message.includes("WB037")) console.error("issue_invoice refused the app's arithmetic", invoiceId.data, error.message);
    return { error: error.message.includes("WB037") ? "This bill does not add up. Nothing was issued. Tell whoever looks after Wagbook." : friendlyError(error) };
  }
  revalidatePath("/app", "layout");
  redirect(`/app/bills/${invoiceId.data}?done=issued`);
}

/** Cancel an issued bill. Owners and managers, with a reason. The number stays used. */
export async function voidBill(_state: FormState, form: FormData): Promise<FormState> {
  const { canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can cancel a bill." };
  const invoiceId = Id.safeParse(form.get("invoiceId"));
  const reason = text(form, "reason");
  if (!invoiceId.success) return { error: "That bill could not be found." };
  if (!reason) return { error: "Say why the bill is cancelled." };
  if (reason.length > 500) return { error: "Keep the reason under 500 characters." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("void_invoice", { p_invoice: invoiceId.data, p_reason: reason });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  redirect(`/app/bills/${invoiceId.data}?done=void`);
}

/** Throw away a draft. Owners and managers (the delete policy). */
export async function deleteDraft(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can delete a draft bill." };
  const invoiceId = Id.safeParse(form.get("invoiceId"));
  if (!invoiceId.success) return { error: "That bill could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").delete().eq("org_id", org.id).eq("id", invoiceId.data).eq("status", "draft").select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "Only a draft bill can be deleted." };
  revalidatePath("/app", "layout");
  redirect("/app/bills");
}

const Payment = z.object({
  amount: z.number().int().positive("Enter the amount received, like 4248."),
  method: z.enum(PAYMENT_METHODS, "Choose how it was paid."),
  receivedOn: z.string().refine(isISODate, "Choose the date the money came in."),
  reference: z.string().max(100, "Keep the reference under 100 characters.").nullable(),
  note: z.string().max(500, "Keep the note under 500 characters.").nullable(),
});

/**
 * Record money that moved: against a bill, or as an advance on a booking.
 * A refund (money going back) is for owners and managers. Wagbook never marks
 * anything paid by itself: this is the only way.
 */
export async function recordPayment(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const invoiceText = text(form, "invoiceId");
  const bookingText = text(form, "bookingId");
  const invoiceId = invoiceText ? Id.safeParse(invoiceText) : null;
  const bookingId = bookingText ? Id.safeParse(bookingText) : null;
  if ((invoiceId && !invoiceId.success) || (bookingId && !bookingId.success) || (!invoiceId && !bookingId)) return { error: "That bill could not be found." };
  const refund = form.get("direction") === "out";
  if (refund && !canManage) return { error: "Only an owner or manager can record a refund." };

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
    if (inv.error || !inv.data) return { error: "That bill could not be found." };
    if (inv.data.status !== "issued") return { error: "Record a payment against an issued bill, or as an advance on the booking." };
    clientId = inv.data.client_id;
    linkedBooking = inv.data.booking_id;
  } else {
    const b = await supabase.from("bookings").select("client_id").eq("org_id", org.id).eq("id", linkedBooking!).maybeSingle();
    if (b.error || !b.data) return { error: "That booking could not be found." };
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
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { ok: refund ? "Refund recorded." : invoiceId ? "Payment recorded." : "Advance recorded. It counts against the bill when the bill is issued." };
}
