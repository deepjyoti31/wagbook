"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { billFor, draftPayload } from "@/lib/billing";
import { addDays, billPeriod, isISODate, parseKgToGrams, todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { CUSTOMER_SOURCES, PLAN_AHEAD_DAYS, PROBLEM_KINDS, WEEKDAYS } from "@/lib/kitchen";
import { readUpload, store } from "@/lib/media";
import { foodBillLines } from "@/lib/stay-bill";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const Slot = z.enum(["morning", "afternoon", "evening"]);
const Plan = z.enum(["full", "topper"]);
type Supabase = Awaited<ReturnType<typeof createClient>>;

function weekdaysOf(form: FormData): number[] {
  return WEEKDAYS.filter((d) => form.get(`day_${d}`) === "on");
}

async function addressOf(supabase: Supabase, orgId: string, clientId: string, value: string | null): Promise<string | null | undefined> {
  if (!value) return null;
  const id = Id.safeParse(value);
  if (!id.success) return undefined;
  const a = await supabase.from("client_addresses").select("id").eq("org_id", orgId).eq("client_id", clientId).eq("id", id.data).maybeSingle();
  return a.data ? a.data.id : undefined;
}

/** Start food delivered to a pet on set days; its deliveries are made three weeks ahead. Any member. */
export async function startSubscription(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.food.errors;
  const pet = Id.safeParse(form.get("petId"));
  if (!pet.success) return { error: e.pet };
  const supabase = await createClient();
  const p = await supabase.from("pets").select("id, client_id").eq("org_id", org.id).eq("id", pet.data).maybeSingle();
  if (!p.data) return { error: e.pet };
  const product = Id.safeParse(form.get("productId"));
  if (!product.success) return { error: e.product };
  const grams = Number(text(form, "grams") ?? "");
  if (!Number.isInteger(grams) || grams < 10 || grams > 5000) return { error: e.grams };
  const days = weekdaysOf(form);
  if (days.length === 0) return { error: e.days };
  const today = todayIn(org.time_zone);
  const startsOn = text(form, "startsOn") ?? today;
  if (!isISODate(startsOn) || startsOn < today) return { error: e.date };
  const address = await addressOf(supabase, org.id, p.data.client_id, text(form, "addressId"));
  if (address === undefined) return { error: e.address };
  const plan = Plan.safeParse(form.get("plan"));
  const slot = Slot.safeParse(form.get("slot"));
  const source = z.enum(CUSTOMER_SOURCES).safeParse(form.get("source"));
  const pay = z.enum(["week", "month"]).safeParse(form.get("pay"));

  const { data, error } = await supabase
    .from("subscriptions")
    .insert({
      org_id: org.id,
      client_id: p.data.client_id,
      pet_id: p.data.id,
      product_id: product.data,
      plan: plan.success ? plan.data : "full",
      grams_per_day: grams,
      weekdays: days,
      slot: slot.success ? slot.data : "morning",
      address_id: address,
      starts_on: startsOn,
      pay_period: pay.success ? pay.data : "week",
      source: source.success ? source.data : "other",
    })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error, t) };
  const planned = await supabase.rpc("plan_subscription", { p_subscription: data.id, p_until: addDays(startsOn > today ? startsOn : today, PLAN_AHEAD_DAYS) });
  if (planned.error) return { error: friendlyError(planned.error, t) };
  // A pet new to the kitchen's food has its portion looked at a week on (Today).
  await supabase.from("pet_food").upsert({ org_id: org.id, pet_id: p.data.id, started_on: startsOn, plan: plan.success ? plan.data : "full" }, { onConflict: "org_id,pet_id", ignoreDuplicates: true });
  revalidatePath("/app", "layout");
  redirect(`/app/food/subscriptions/${data.id}?done=started`);
}

/**
 * Change a subscription: grams, plan, days, time, address; pause, resume or
 * end it. The database makes again the deliveries still open to change.
 */
export async function changeSubscription(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.food.errors;
  const w = t.m.subscription;
  const id = Id.safeParse(form.get("subscriptionId"));
  if (!id.success) return { error: w.errors.notFound };
  const supabase = await createClient();
  const sub = await supabase.from("subscriptions").select("id, client_id").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (!sub.data) return { error: w.errors.notFound };
  const today = todayIn(org.time_zone);
  const intent = form.get("intent");

  let update: Database["public"]["Tables"]["subscriptions"]["Update"];
  let ok: string;
  if (intent === "pause") {
    const from = text(form, "from");
    const until = text(form, "until");
    if (!from || !isISODate(from) || from < today || (until !== null && (!isISODate(until) || until < from))) return { error: w.errors.dates };
    update = { paused_from: from, paused_until: until };
    ok = w.pausedDone;
  } else if (intent === "resume") {
    update = { paused_from: null, paused_until: null };
    ok = w.resumed;
  } else if (intent === "end") {
    const on = text(form, "on");
    const reason = text(form, "reason");
    if (!on || !isISODate(on) || on < today) return { error: w.errors.dates };
    if (!reason || reason.length > 300) return { error: w.errors.reason };
    update = { cancelled_on: on, cancel_reason: reason };
    ok = w.ended;
  } else {
    const grams = Number(text(form, "grams") ?? "");
    if (!Number.isInteger(grams) || grams < 10 || grams > 5000) return { error: e.grams };
    const days = weekdaysOf(form);
    if (days.length === 0) return { error: e.days };
    const address = await addressOf(supabase, org.id, sub.data.client_id, text(form, "addressId"));
    if (address === undefined) return { error: e.address };
    const plan = Plan.safeParse(form.get("plan"));
    const slot = Slot.safeParse(form.get("slot"));
    const pay = z.enum(["week", "month"]).safeParse(form.get("pay"));
    if (!plan.success || !slot.success || !pay.success) return { error: t.m.errors.missing };
    update = { grams_per_day: grams, weekdays: days, address_id: address, plan: plan.data, slot: slot.data, pay_period: pay.data };
    ok = w.saved;
  }
  const { error } = await supabase.from("subscriptions").update(update).eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  // A resumed subscription has its deliveries made again.
  if (intent === "resume") await supabase.rpc("plan_subscription", { p_subscription: id.data, p_until: addDays(today, PLAN_AHEAD_DAYS) });
  revalidatePath("/app", "layout");
  return { ok };
}

/** Cancel one delivery, with a reason. After the cut-off only an owner or manager may (the database decides: WB151). */
export async function cancelDelivery(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.subscription;
  const id = Id.safeParse(form.get("deliveryId"));
  if (!id.success) return { error: t.m.food.errors.notFound };
  const reason = text(form, "reason");
  if (!reason || reason.length > 300) return { error: w.errors.reason };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliveries")
    .update({ status: "cancelled", cancel_reason: reason })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .select("id, subscription_id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.food.errors.notFound };
  revalidatePath("/app", "layout");
  // The row's form goes away once the delivery is cancelled, so the sentence is shown by the page instead.
  if (data[0].subscription_id) redirect(`/app/food/subscriptions/${data[0].subscription_id}?done=cancelled`);
  return { ok: w.cancelledDelivery };
}

/** A one-off order for a pet: a trial, food by the kilo, or an item made to order. The database prices it. Any member. */
export async function addOrder(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.food.errors;
  const pet = Id.safeParse(form.get("petId"));
  if (!pet.success) return { error: e.pet };
  const supabase = await createClient();
  const p = await supabase.from("pets").select("id, client_id").eq("org_id", org.id).eq("id", pet.data).maybeSingle();
  if (!p.data) return { error: e.pet };
  const kind = z.enum(["trial", "order", "item"]).safeParse(form.get("kind"));
  const product = Id.safeParse(form.get("productId"));
  if (!kind.success || !product.success) return { error: e.product };
  const today = todayIn(org.time_zone);
  const date = text(form, "date") ?? "";
  if (!isISODate(date) || date < today) return { error: e.date };
  const address = await addressOf(supabase, org.id, p.data.client_id, text(form, "addressId"));
  if (address === undefined) return { error: e.address };
  let grams = 0;
  let quantity = 1;
  if (kind.data === "order") {
    const g = parseKgToGrams(text(form, "kg") ?? "");
    if (g === null) return { error: e.kg };
    grams = Math.ceil(g / org.food_pack_g) * org.food_pack_g;
  }
  if (kind.data === "item") {
    quantity = Number(text(form, "quantity") ?? "1");
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) return { error: e.quantity };
  }
  const recipeText = text(form, "recipeId");
  const recipe = recipeText ? Id.safeParse(recipeText) : null;
  const version = recipe?.success ? (await supabase.from("recipe_current").select("version_id").eq("org_id", org.id).eq("recipe_id", recipe.data).maybeSingle()).data : null;
  const slot = Slot.safeParse(form.get("slot"));
  const { error } = await supabase.from("deliveries").insert({
    org_id: org.id,
    kind: kind.data,
    client_id: p.data.client_id,
    pet_id: p.data.id,
    product_id: product.data,
    delivery_date: date,
    slot: slot.success ? slot.data : "morning",
    address_id: address,
    grams,
    quantity,
    recipe_id: kind.data === "item" || !recipe?.success ? null : recipe.data,
    version_id: kind.data === "item" ? null : (version?.version_id ?? null),
    note: text(form, "note")?.slice(0, 300) ?? null,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.food.orderAdded, { date }) };
}

/**
 * Make the bill for a subscription's week or month, or for a one-off order,
 * from its deliveries as they are now (foodBillLines), or open the live one.
 */
export async function makeFoodBill(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const supabase = await createClient();
  const subText = text(form, "subscriptionId");
  const deliveryText = text(form, "deliveryId");
  let scope: { subscription: string; from: string; to: string } | { delivery: string };
  let clientId: string;
  if (subText) {
    const id = Id.safeParse(subText);
    if (!id.success) return { error: t.m.subscription.errors.notFound };
    const sub = await supabase.from("subscriptions").select("id, client_id, pay_period").eq("org_id", org.id).eq("id", id.data).maybeSingle();
    if (!sub.data) return { error: t.m.subscription.errors.notFound };
    const from = text(form, "from") ?? "";
    if (!isISODate(from)) return { error: t.m.subscription.errors.dates };
    const period = billPeriod(from, sub.data.pay_period);
    scope = { subscription: sub.data.id, ...period };
    clientId = sub.data.client_id;
  } else {
    const id = Id.safeParse(deliveryText);
    if (!id.success) return { error: t.m.food.errors.notFound };
    const d = await supabase.from("deliveries").select("id, client_id").eq("org_id", org.id).eq("id", id.data).maybeSingle();
    if (!d.data) return { error: t.m.food.errors.notFound };
    scope = { delivery: d.data.id };
    clientId = d.data.client_id;
  }

  const built = await foodBillLines(supabase, org.id, scope);
  if ("error" in built) return { error: friendlyError(built.error, t) };
  if (built.lines.length === 0) return { error: t.m.subscription.nothingToBill };
  let existingQuery = supabase.from("invoices").select("id, status").eq("org_id", org.id).neq("status", "void");
  existingQuery = "subscription" in scope ? existingQuery.eq("subscription_id", scope.subscription).eq("period_start", scope.from) : existingQuery.eq("delivery_id", scope.delivery);
  const existing = await existingQuery.maybeSingle();
  if (existing.error) return { error: friendlyError(existing.error, t) };
  if (existing.data?.status === "issued") redirect(`/app/bills/${existing.data.id}`);
  let invoiceId = existing.data?.id;
  if (!invoiceId) {
    const created = await supabase
      .from("invoices")
      .insert({
        org_id: org.id,
        client_id: clientId,
        subscription_id: "subscription" in scope ? scope.subscription : null,
        period_start: "subscription" in scope ? scope.from : null,
        period_end: "subscription" in scope ? scope.to : null,
        delivery_id: "delivery" in scope ? scope.delivery : null,
      })
      .select("id")
      .single();
    if (created.error) return { error: friendlyError(created.error, t) };
    invoiceId = created.data.id;
  }
  const saved = await supabase.rpc("save_invoice_draft", { p_invoice: invoiceId, ...draftPayload(billFor(org, built.lines)) });
  if (saved.error) return { error: friendlyError(saved.error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/bills/${invoiceId}`);
}

/** Confirm an order from the website or a parent's change, once the money has arrived (confirm_food_order). Any member. */
export async function confirmOrder(_state: FormState, form: FormData): Promise<FormState> {
  await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("orderId"));
  if (!id.success) return { error: t.m.food.errors.notFound };
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_food_order", { p_order: id.data });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  // The order leaves the waiting list, and its form with it, so the sentence is shown by the page instead.
  redirect("/app/food/orders?done=confirmed");
}

/** Decline an order or a change. Any member. */
export async function declineOrder(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("orderId"));
  if (!id.success) return { error: t.m.food.errors.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("food_orders").update({ status: "declined" }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.food.errors.notFound };
  revalidatePath("/app", "layout");
  redirect("/app/food/orders?done=declined");
}

/** A parent said a delivery was damaged, late or wrong, within the kennel's window (the database checks: WB174). Any member. */
export async function reportProblem(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.subscription;
  const id = Id.safeParse(form.get("deliveryId"));
  if (!id.success) return { error: w.errors.delivery };
  const kind = z.enum(PROBLEM_KINDS).safeParse(form.get("kind"));
  if (!kind.success) return { error: t.m.errors.missing };
  const supabase = await createClient();
  const photo = await readUpload(form.get("photo"), t.m);
  if (photo && "error" in photo) return { error: photo.error };
  let path: string | null = null;
  if (photo) {
    path = `${org.id}/deliveries/${id.data}/problem-${crypto.randomUUID()}.jpg`;
    if (await store(supabase, path, photo)) return { error: t.m.rider.errors.photo };
  }
  const { error } = await supabase.from("delivery_problems").insert({
    org_id: org.id,
    delivery_id: id.data,
    kind: kind.data,
    note: text(form, "note")?.slice(0, 500) ?? null,
    photo_path: path,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: w.reported };
}

/** Deal with a problem: make the delivery again at no charge, or say it was refunded from the bill, or that nothing was done. Any member. */
export async function resolveProblem(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("problemId"));
  if (!id.success) return { error: t.m.food.errors.notFound };
  const outcome = z.enum(["replaced", "refunded", "none"]).safeParse(form.get("outcome"));
  if (!outcome.success) return { error: t.m.errors.missing };
  const supabase = await createClient();
  const problem = await supabase
    .from("delivery_problems")
    .select("id, deliveries!delivery_problems_org_id_delivery_id_fkey(id, client_id, pet_id, subscription_id, grams, recipe_id, version_id, address_id, slot)")
    .eq("org_id", org.id)
    .eq("id", id.data)
    .maybeSingle();
  const original = problem.data?.deliveries;
  if (!problem.data || !original) return { error: t.m.food.errors.notFound };
  let replacement: string | null = null;
  if (outcome.data === "replaced") {
    const on = text(form, "on") ?? "";
    if (!isISODate(on) || on < todayIn(org.time_zone)) return { error: t.m.food.errors.date };
    const made = await supabase
      .from("deliveries")
      .insert({
        org_id: org.id,
        kind: "replacement",
        client_id: original.client_id,
        pet_id: original.pet_id,
        delivery_date: on,
        slot: original.slot,
        address_id: original.address_id,
        grams: original.grams,
        recipe_id: original.recipe_id,
        version_id: original.version_id,
        replaces_id: original.id,
      })
      .select("id")
      .single();
    if (made.error) return { error: friendlyError(made.error, t) };
    replacement = made.data.id;
  }
  const { error } = await supabase
    .from("delivery_problems")
    .update({ outcome: outcome.data, replacement_id: replacement, resolved_at: new Date().toISOString() })
    .eq("org_id", org.id)
    .eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  // The problem's form goes away once it is dealt with, so the sentence is shown by the page instead.
  if (original.subscription_id) redirect(`/app/food/subscriptions/${original.subscription_id}?done=${outcome.data === "replaced" ? "replaced" : "resolved"}`);
  // A problem with a trial or an order is dealt with on Food (M59).
  redirect(`/app/food?done=${outcome.data === "replaced" ? "replaced" : "resolved"}`);
}
