"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isSacCode, parseMoney, parseQuantity, parseRatePercent, quantitiesFrom } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { SHOP_KINDS } from "@/lib/kitchen";
import { makeSaleBill, shopItems } from "@/lib/shop";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/**
 * Sell things over the counter (M62): to the walk-in buyer, to a parent on a
 * bill of its own, or on a stay's bill. The database prices each line, takes
 * the stock out and refuses what is not there (sell). A bill of its own is
 * made at once and opened, ready to issue; a sale on a stay waits for the
 * stay's bill.
 */
export async function sellItems(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const s = t.m.sell;
  const supabase = await createClient();
  const items = await shopItems(supabase, org.id);
  if (!items) return { error: t.m.errors.generic };
  const lines = quantitiesFrom(form.entries(), new Set(items.map((i) => i.item_id)));
  if (lines === null) return { error: s.quantity };
  if (lines.length === 0) return { error: s.nothing };

  // "own" or empty: a bill of its own. A stay's id: on that stay's bill.
  const putOn = text(form, "putOn");
  const booking = putOn && putOn !== "own" ? Id.safeParse(putOn) : null;
  if (booking && !booking.success) return { error: t.m.errors.bookingNotFound };
  const clientText = text(form, "clientId");
  const client = clientText ? Id.safeParse(clientText) : null;
  if (client && !client.success) return { error: t.m.errors.generic };

  const sold = await supabase.rpc("sell", {
    p_org: org.id,
    p_lines: lines,
    p_client: client?.data,
    p_booking: booking?.data,
  });
  if (sold.error) return { error: friendlyError(sold.error, t) };
  revalidatePath("/app", "layout");
  if (booking) return { ok: s.onStay };

  const bill = await makeSaleBill(supabase, org, sold.data);
  if ("error" in bill) return { error: s.billFailed };
  redirect(`/app/bills/${bill.id}`);
}

/** Make the bill of its own for a sale whose bill was not made when it was sold. */
export async function makeBillForSale(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const sale = Id.safeParse(form.get("saleId"));
  if (!sale.success) return { error: t.m.errors.generic };
  const supabase = await createClient();
  const bill = await makeSaleBill(supabase, org, sale.data);
  if ("error" in bill) return { error: friendlyError(bill.error, t) };
  redirect(`/app/bills/${bill.id}`);
}

/** Cancel a sale made by mistake, before its bill has gone out: its stock comes back. Owners and managers (cancel_sale). */
export async function cancelSale(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.shop.errors;
  if (!canManage) return { error: e.managers };
  const sale = Id.safeParse(form.get("saleId"));
  if (!sale.success) return { error: t.m.errors.generic };
  const reason = text(form, "reason");
  if (!reason) return { error: e.reason };
  const supabase = await createClient();
  // The sale must be this kennel's: the function checks, and so does this filter.
  const found = await supabase.from("sales").select("id").eq("org_id", org.id).eq("id", sale.data).maybeSingle();
  if (!found.data) return { error: t.m.errors.generic };
  const { error } = await supabase.rpc("cancel_sale", { p_sale: sale.data, p_reason: reason.slice(0, 300) });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  // The sale's row changes under the form, so the sentence goes back with the page.
  const back = text(form, "back");
  if (back && /^\/app\/(shop|bookings\/[0-9a-f-]{36})$/.test(back)) redirect(`${back}?done=sale-cancelled`);
  return { ok: t.m.shop.cancelledOk };
}

/** The price, tax rate, HSN code and reorder level typed on the shop's forms. */
function saleFields(form: FormData, e: { price: string; rate: string; hsn: string; level: string }) {
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price <= 0) return { error: e.price };
  const rate = parseRatePercent(text(form, "rate") ?? "0");
  if (rate === undefined) return { error: e.rate };
  const hsn = text(form, "hsn");
  if (hsn !== null && !isSacCode(hsn)) return { error: e.hsn };
  const levelText = text(form, "lowLevel");
  const low = levelText === null ? null : parseQuantity(levelText, "piece");
  if (levelText !== null && low === null) return { error: e.level };
  return { fields: { sell_price_minor: price, sell_tax_rate_bp: rate ?? 0, hsn_code: hsn, low_level: low } };
}

/** Add something to sell, by the piece. Owners and managers (the policy decides too). */
export async function addShopItem(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.shop.errors;
  if (!canManage) return { error: e.managers };
  const name = z.string().trim().min(1).max(80).safeParse(text(form, "name") ?? "");
  if (!name.success) return { error: e.name };
  const kind = z.enum(SHOP_KINDS).safeParse(form.get("kind"));
  if (!kind.success) return { error: t.m.errors.missing };
  const typed = saleFields(form, e);
  if ("error" in typed) return { error: typed.error };
  const supplierText = text(form, "supplierId");
  const supplier = supplierText ? Id.safeParse(supplierText) : null;
  const supabase = await createClient();
  const { error } = await supabase.from("stock_items").insert({
    org_id: org.id,
    name: name.data,
    unit: "piece",
    kind: kind.data,
    supplier_id: supplier?.success ? supplier.data : null,
    ...typed.fields,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.shop.added, { name: name.data }) };
}

/** Change what something sells for, or stop selling it. Owners and managers; a sale already made keeps its price. */
export async function updateShopItem(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.shop.errors;
  if (!canManage) return { error: e.managers };
  const item = Id.safeParse(form.get("itemId"));
  if (!item.success) return { error: t.m.errors.generic };
  const supabase = await createClient();
  const found = await supabase.from("stock_items").select("name").eq("org_id", org.id).eq("id", item.data).maybeSingle();
  if (!found.data) return { error: t.m.errors.generic };
  if (form.get("intent") === "stop") {
    const { error } = await supabase.from("stock_items").update({ sell_price_minor: null }).eq("org_id", org.id).eq("id", item.data);
    if (error) return { error: friendlyError(error, t) };
    revalidatePath("/app", "layout");
    return { ok: fill(t.m.shop.stopped, { name: found.data.name }) };
  }
  const typed = saleFields(form, e);
  if ("error" in typed) return { error: typed.error };
  const { error } = await supabase.from("stock_items").update(typed.fields).eq("org_id", org.id).eq("id", item.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.shop.saved, { name: found.data.name }) };
}
