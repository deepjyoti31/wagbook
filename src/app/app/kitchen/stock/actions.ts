"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, normalizePhone, parseMoney, parseQuantity, todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { quantityText, STOCK_KINDS, STOCK_UNITS, WASTE_REASONS } from "@/lib/kitchen";
import { readUpload, store } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
type Supabase = Awaited<ReturnType<typeof createClient>>;

async function itemOf(supabase: Supabase, orgId: string, id: unknown) {
  const parsed = Id.safeParse(id);
  if (!parsed.success) return null;
  const { data } = await supabase.from("stock_items").select("id, name, unit, supplier_id").eq("org_id", orgId).eq("id", parsed.data).maybeSingle();
  return data;
}

/** Add something the kitchen keeps in stock. Owners and managers (the policy decides too). */
export async function addItem(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.stock.errors;
  if (!canManage) return { error: e.managers };
  const name = z.string().trim().min(1).max(80).safeParse(text(form, "name") ?? "");
  if (!name.success) return { error: e.name };
  const unit = z.enum(STOCK_UNITS).safeParse(form.get("unit"));
  const kind = z.enum(STOCK_KINDS).safeParse(form.get("kind"));
  if (!unit.success || !kind.success) return { error: t.m.errors.missing };
  const levelText = text(form, "lowLevel");
  const low = levelText === null ? null : parseQuantity(levelText, unit.data);
  if (levelText !== null && low === null) return { error: e.level };
  const supplierText = text(form, "supplierId");
  const supplier = supplierText ? Id.safeParse(supplierText) : null;
  const supabase = await createClient();
  const { error } = await supabase.from("stock_items").insert({
    org_id: org.id,
    name: name.data,
    unit: unit.data,
    kind: kind.data,
    low_level: low,
    supplier_id: supplier?.success ? supplier.data : null,
    never_in_recipe: checked(form, "never"),
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/kitchen", "layout");
  return { ok: fill(t.m.stock.itemAdded, { name: name.data }) };
}

/** Add a supplier. Owners and managers. */
export async function addSupplier(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.stock.errors;
  if (!canManage) return { error: e.managers };
  const name = z.string().trim().min(1).max(80).safeParse(text(form, "name") ?? "");
  if (!name.success) return { error: e.name };
  const phoneText = text(form, "phone");
  const phone = phoneText === null ? null : normalizePhone(phoneText, org.country_code === "IN" ? "IN" : null);
  if (phoneText !== null && phone === null) return { error: e.phone };
  const supplies = text(form, "supplies");
  const supabase = await createClient();
  const { error } = await supabase.from("suppliers").insert({ org_id: org.id, name: name.data, phone, supplies: supplies?.slice(0, 200) ?? null });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/kitchen", "layout");
  return { ok: fill(t.m.stock.supplierAdded, { name: name.data }) };
}

/**
 * Stock bought in, with its cost, the supplier's bill and its photo, and if
 * asked, the same money as an expense (E4), in one step (record_purchase).
 * The photo goes under the expenses folder, which only owners and managers open.
 */
export async function recordPurchase(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.stock.errors;
  if (!canManage) return { error: e.managers };
  const supabase = await createClient();
  const item = await itemOf(supabase, org.id, form.get("itemId"));
  if (!item) return { error: e.item };
  const quantity = parseQuantity(text(form, "quantity") ?? "", item.unit);
  if (quantity === null) return { error: e.quantity };
  const cost = parseMoney(text(form, "cost") ?? "");
  if (cost === null || cost < 0) return { error: e.cost };
  const on = text(form, "on") ?? todayIn(org.time_zone);
  const useBy = text(form, "useBy");
  if (!isISODate(on) || (useBy !== null && !isISODate(useBy))) return { error: e.date };
  const billNumber = text(form, "billNumber")?.slice(0, 40) ?? null;

  const photo = await readUpload(form.get("bill"), t.m, { allowPdf: true });
  if (photo && "error" in photo) return { error: photo.error };
  let path: string | null = null;
  if (photo) {
    path = `${org.id}/expenses/stock-${crypto.randomUUID()}.${photo.extension}`;
    if (await store(supabase, path, photo)) return { error: e.photoFailed };
  }

  const supplierText = text(form, "supplierId");
  const supplier = supplierText ? Id.safeParse(supplierText) : null;
  const { error } = await supabase.rpc("record_purchase", {
    p_org: org.id,
    p_item: item.id,
    p_quantity: quantity,
    p_cost_minor: cost,
    p_on: on,
    p_supplier: supplier?.success ? supplier.data : undefined,
    p_use_by: useBy ?? undefined,
    p_bill_number: billNumber ?? undefined,
    p_bill_path: path ?? undefined,
    p_expense_category: checked(form, "asExpense") ? t.m.stock.expenseCategory : undefined,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.stock.bought, { quantity: quantityText(quantity, item.unit, t.locale), item: item.name }) };
}

/** Stock thrown away, with a reason. Any member. */
export async function recordWaste(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.stock.errors;
  const supabase = await createClient();
  const item = await itemOf(supabase, org.id, form.get("itemId"));
  if (!item) return { error: e.item };
  const quantity = parseQuantity(text(form, "quantity") ?? "", item.unit);
  if (quantity === null) return { error: e.quantity };
  const reason = z.enum(WASTE_REASONS).safeParse(form.get("reason"));
  if (!reason.success) return { error: e.reason };
  const on = text(form, "on") ?? todayIn(org.time_zone);
  if (!isISODate(on)) return { error: e.date };
  const { error } = await supabase.from("stock_moves").insert({
    org_id: org.id,
    item_id: item.id,
    kind: "waste",
    quantity: -quantity,
    happened_on: on,
    reason: reason.data,
    note: text(form, "note")?.slice(0, 300) ?? null,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/kitchen", "layout");
  return { ok: fill(t.m.stock.wasted, { quantity: quantityText(quantity, item.unit, t.locale), item: item.name }) };
}

/** A stock take: the database records the difference from what the movements say. Any member. */
export async function recordCount(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.stock.errors;
  const supabase = await createClient();
  const item = await itemOf(supabase, org.id, form.get("itemId"));
  if (!item) return { error: e.item };
  const typed = text(form, "counted") ?? "";
  const counted = /^0+$/.test(typed.trim()) ? 0 : parseQuantity(typed, item.unit);
  if (counted === null) return { error: e.quantity };
  const on = text(form, "on") ?? todayIn(org.time_zone);
  if (!isISODate(on)) return { error: e.date };
  const { data, error } = await supabase
    .from("stock_moves")
    .insert({ org_id: org.id, item_id: item.id, kind: "count", quantity: 0, counted, happened_on: on })
    .select("quantity")
    .single();
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/kitchen", "layout");
  const difference = data.quantity;
  return { ok: fill(t.m.stock.countRecorded, { item: item.name, difference: `${difference > 0 ? "+" : ""}${quantityText(difference, item.unit, t.locale)}` }) };
}
