"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { PAYMENT_METHODS } from "@/lib/billing";
import { cancelledStayOutcome } from "@/lib/cancellation";
import { addMonths, parseMoney, todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import type { TablesInsert } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/**
 * Confirm what a cancelled stay's advance becomes (M38): the refund the rules
 * give, and the credit, as a refund kept as credit. Worked out again here from
 * the database, never from the page. Owners and managers: refunds are theirs.
 */
export async function settleCancellation(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.cancelRules;
  if (!canManage) return { error: w.errors.managersOnly };
  const id = Id.safeParse(form.get("bookingId"));
  if (!id.success) return { error: t.m.errors.bookingNotFound };
  const choice = form.get("choice") === "credit" ? "credit" : "refund";
  const method = z.enum(PAYMENT_METHODS).catch("upi").parse(form.get("method"));
  const supabase = await createClient();
  const worked = await cancelledStayOutcome(supabase, org, id.data, choice);
  if (!worked) return { error: t.m.errors.bookingNotFound };
  // What is still to give back: confirming twice never gives the same money back twice.
  const { toSettle, clientId } = worked;
  if (toSettle.refundMinor + toSettle.creditMinor === 0) return { error: w.errors.nothing };
  const today = todayIn(org.time_zone);
  const base = { org_id: org.id, client_id: clientId, booking_id: id.data, received_on: today, direction: "out" };
  const rows: TablesInsert<"payments">[] = [
    ...(toSettle.refundMinor > 0 ? [{ ...base, amount_minor: toSettle.refundMinor, method, note: w.refundNote }] : []),
    ...(toSettle.creditMinor > 0 ? [{ ...base, amount_minor: toSettle.creditMinor, method: "credit" as const, note: w.creditNote }] : []),
  ];
  for (const row of rows) {
    const { error } = await supabase.from("payments").insert(row);
    if (error) return { error: friendlyError(error, t) };
  }
  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${id.data}?money=settled`);
}

/** Give a parent credit as a goodwill gesture, with a reason. Owners and managers. */
export async function giveCredit(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.credit;
  if (!canManage) return { error: w.errors.managersOnly };
  const client = Id.safeParse(form.get("clientId"));
  if (!client.success) return { error: t.m.errors.parentNotFound };
  const amount = parseMoney(text(form, "amount") ?? "");
  if (amount === null || amount <= 0) return { error: w.errors.amount };
  const reason = text(form, "reason");
  if (!reason || reason.length > 300) return { error: w.errors.reason };
  const expires = addMonths(todayIn(org.time_zone), org.credit_months);
  const supabase = await createClient();
  const { error } = await supabase.from("credits").insert({ org_id: org.id, client_id: client.data, kind: "goodwill", amount_minor: amount, expires_on: expires, reason });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath(`/app/clients/${client.data}`);
  return { ok: w.given };
}

/** A pick-up from home on the stay's first day, or a drop home on its last (M39). The database prices it from the area. */
export async function addTrip(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.trips.errors;
  const booking = Id.safeParse(form.get("bookingId"));
  const address = Id.safeParse(form.get("addressId"));
  if (!booking.success) return { error: t.m.errors.bookingNotFound };
  if (!address.success) return { error: e.address };
  const kind = form.get("kind") === "drop" ? "drop" : "pickup";
  const time = Clock.safeParse(text(form, "time"));
  if (!time.success) return { error: e.time };
  const priceText = canManage ? text(form, "price") : null;
  const price = priceText === null ? null : parseMoney(priceText);
  if (priceText !== null && (price === null || price < 0)) return { error: e.price };
  const supabase = await createClient();
  const b = await supabase.from("bookings").select("client_id, pet_id").eq("org_id", org.id).eq("id", booking.data).maybeSingle();
  if (!b.data) return { error: t.m.errors.bookingNotFound };
  const { error } = await supabase.from("trips").insert({
    org_id: org.id,
    booking_id: booking.data,
    client_id: b.data.client_id,
    pet_id: b.data.pet_id,
    kind,
    trip_date: todayIn(org.time_zone),
    at_time: time.data,
    address_id: address.data,
    price_minor: price,
    note: text(form, "note"),
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath(`/app/bookings/${booking.data}`);
  return { ok: fill(t.m.trips.added, { kind: t.m.trips.kinds[kind] }) };
}

/** Cancel a trip with a reason. Any member; it stays cancelled. */
export async function cancelTrip(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("tripId"));
  if (!id.success) return { error: t.m.trips.errors.notFound };
  const reason = text(form, "reason");
  if (!reason || reason.length > 300) return { error: t.m.trips.errors.reason };
  const supabase = await createClient();
  const { data, error } = await supabase.from("trips").update({ status: "cancelled", cancel_reason: reason }).eq("org_id", org.id).eq("id", id.data).select("booking_id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.trips.errors.notFound };
  revalidatePath(`/app/bookings/${data[0].booking_id}`);
  return { ok: t.m.trips.cancelled };
}

/** Let a pet in although it lacks what the kennel requires (M40): owners and managers, with the reason, kept in the history. */
export async function letPetIn(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.health;
  if (!canManage) return { error: w.errors.managersOnly };
  const booking = Id.safeParse(form.get("bookingId"));
  const appointment = Id.safeParse(form.get("appointmentId"));
  if (!booking.success && !appointment.success) return { error: t.m.errors.bookingNotFound };
  const reason = text(form, "reason");
  if (!reason || reason.length < 3 || reason.length > 300) return { error: w.errors.reason };
  const supabase = await createClient();
  const { error } = await supabase.from("health_overrides").insert({
    org_id: org.id,
    booking_id: booking.success ? booking.data : null,
    appointment_id: booking.success ? null : appointment.success ? appointment.data : null,
    reason,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: w.letIn };
}
