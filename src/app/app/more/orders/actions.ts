"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, parseMoney, parseQuantity, todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { readUpload, store } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/**
 * Quantities typed per item, in each item's unit ("5 kg", "12"), from fields
 * named `q-{item id}`. Null when one cannot be read; empty fields are left out.
 */
function typedQuantities(form: FormData, items: readonly { id: string; unit: "g" | "ml" | "piece" }[]): { item_id: string; quantity: number }[] | null {
  const out: { item_id: string; quantity: number }[] = [];
  for (const item of items) {
    const typed = text(form, `q-${item.id}`);
    if (typed === null || /^0+$/.test(typed)) continue;
    const quantity = parseQuantity(typed, item.unit);
    if (quantity === null || quantity <= 0) return null;
    out.push({ item_id: item.id, quantity });
  }
  return out;
}

/** Place an order to a supplier and open it, ready to send on WhatsApp. Owners and managers (place_supplier_order). */
export async function placeOrder(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.orderPage.errors;
  if (!canManage) return { error: e.managers };
  const supplier = Id.safeParse(form.get("supplierId"));
  if (!supplier.success) return { error: e.supplier };
  const supabase = await createClient();
  const items = await supabase.from("stock_items").select("id, unit").eq("org_id", org.id).eq("is_active", true);
  if (items.error) return { error: friendlyError(items.error, t) };
  const lines = typedQuantities(form, items.data);
  if (lines === null) return { error: e.quantity };
  if (lines.length === 0) return { error: e.nothing };
  const placed = await supabase.rpc("place_supplier_order", { p_org: org.id, p_supplier: supplier.data, p_lines: lines, p_note: text(form, "note") ?? undefined });
  if (placed.error) return { error: friendlyError(placed.error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/more/orders/${placed.data}`);
}

/** Say the order went on WhatsApp. Owners and managers. */
export async function markSent(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.orderPage.errors.managers };
  const order = Id.safeParse(form.get("orderId"));
  if (!order.success) return { error: t.m.orderPage.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("supplier_orders").update({ sent_at: new Date().toISOString() }).eq("org_id", org.id).eq("id", order.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.orderPage.notFound };
  revalidatePath("/app/more/orders", "layout");
  // The page changes under the form, so the sentence goes back with it.
  redirect(`/app/more/orders/${order.data}?done=sent`);
}

/**
 * Put in stock what came of an order, in full or in part (receive_supplier_order).
 * Anyone; a cost, for recipe costs, only from owners and managers.
 */
export async function receiveOrder(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.orderPage.errors;
  const order = Id.safeParse(form.get("orderId"));
  if (!order.success) return { error: t.m.orderPage.notFound };
  const supabase = await createClient();
  const lines = await supabase.from("supplier_order_lines").select("item_id, stock_items(unit)").eq("org_id", org.id).eq("order_id", order.data);
  if (lines.error) return { error: friendlyError(lines.error, t) };
  const on = text(form, "on") ?? todayIn(org.time_zone);
  if (!isISODate(on)) return { error: e.date };
  const came: { item_id: string; quantity: number; use_by: string | null; cost_minor: number | null }[] = [];
  for (const l of lines.data) {
    const typed = text(form, `q-${l.item_id}`);
    if (typed === null || /^0+$/.test(typed)) continue;
    const quantity = parseQuantity(typed, l.stock_items?.unit ?? "g");
    if (quantity === null || quantity <= 0) return { error: e.quantity };
    const useBy = text(form, `useBy-${l.item_id}`);
    if (useBy !== null && !isISODate(useBy)) return { error: e.date };
    const costText = canManage ? text(form, `cost-${l.item_id}`) : null;
    const cost = costText === null ? null : parseMoney(costText);
    if (costText !== null && (cost === null || cost < 0)) return { error: e.cost };
    came.push({ item_id: l.item_id, quantity, use_by: useBy, cost_minor: cost });
  }
  if (came.length === 0) return { error: e.nothing };
  const { error } = await supabase.rpc("receive_supplier_order", { p_order: order.data, p_on: on, p_lines: came });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/more/orders/${order.data}?done=received`);
}

/** Write the supplier's bill for an order down as an expense, once (record_supplier_bill). Owners and managers. */
export async function recordOrderBill(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.orderPage.errors;
  if (!canManage) return { error: e.managers };
  const order = Id.safeParse(form.get("orderId"));
  if (!order.success) return { error: t.m.orderPage.notFound };
  const amount = parseMoney(text(form, "amount") ?? "");
  if (amount === null || amount <= 0) return { error: e.amount };
  const on = text(form, "on") ?? todayIn(org.time_zone);
  if (!isISODate(on)) return { error: e.date };
  const category = text(form, "category")?.slice(0, 60);
  if (!category) return { error: e.category };
  const supabase = await createClient();
  const found = await supabase.from("supplier_orders").select("id").eq("org_id", org.id).eq("id", order.data).maybeSingle();
  if (!found.data) return { error: t.m.orderPage.notFound };

  const photo = await readUpload(form.get("bill"), t.m, { allowPdf: true });
  if (photo && "error" in photo) return { error: photo.error };
  let path: string | null = null;
  if (photo) {
    path = `${org.id}/expenses/order-${crypto.randomUUID()}.${photo.extension}`;
    if (await store(supabase, path, photo)) return { error: e.photoFailed };
  }
  const { error } = await supabase.rpc("record_supplier_bill", {
    p_order: order.data,
    p_amount_minor: amount,
    p_on: on,
    p_category: category,
    p_bill_number: text(form, "billNumber")?.slice(0, 40) ?? undefined,
    p_bill_path: path ?? undefined,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/more/orders/${order.data}?done=bill`);
}

/** Close an order whose rest is not coming. What came stays in stock. Owners and managers. */
export async function closeOrder(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.orderPage.errors.managers };
  const order = Id.safeParse(form.get("orderId"));
  if (!order.success) return { error: t.m.orderPage.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("supplier_orders").update({ status: "closed" }).eq("org_id", org.id).eq("id", order.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.orderPage.notFound };
  revalidatePath("/app", "layout");
  redirect(`/app/more/orders/${order.data}?done=closed`);
}
