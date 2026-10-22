"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { parseKgToGrams, parseMoney } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { FOOD_PRODUCT_KINDS, parsePercentBp } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";

/** How portions are worked out, packs, the cut-off and the rest. Owners and managers (the policy decides too). */
export async function saveKitchenSettings(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.kitchenSettings.errors;
  if (!canManage) return { error: e.managers };
  const pct = (name: string, max = 100) => parsePercentBp(text(form, name), max);
  const whole = (name: string) => {
    const v = text(form, name);
    return v !== null && /^\d{1,4}$/.test(v) ? Number(v) : null;
  };
  const small = pct("small", 10);
  const medium = pct("medium", 10);
  const large = pct("large", 10);
  const topper = pct("topper", 90);
  const goal = pct("goal", 30);
  const monthly = pct("monthly", 50);
  const margin = pct("margin", 50);
  const smallMax = parseKgToGrams(text(form, "smallMax") ?? "");
  const mediumMax = parseKgToGrams(text(form, "mediumMax") ?? "");
  const pack = whole("pack");
  const cutoff = whole("cutoff");
  const window = whole("window");
  const lead = form.has("lead") ? whole("lead") : null;
  const values = [small, medium, large, topper, goal, monthly, margin, smallMax, mediumMax, cutoff, window];
  if (values.some((v) => v === null)) return { error: e.number };
  if (lead !== null && lead > 336) return { error: e.number };
  if (pack === null || pack < 50 || pack > 5000 || pack % 10 !== 0) return { error: e.pack };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      portion_small_bp: small!,
      portion_medium_bp: medium!,
      portion_large_bp: large!,
      small_dog_max_g: smallMax!,
      medium_dog_max_g: mediumMax!,
      topper_share_bp: topper!,
      goal_change_bp: goal!,
      food_pack_g: pack,
      food_cutoff_hours: cutoff!,
      monthly_food_discount_bp: monthly!,
      cook_margin_bp: margin!,
      problem_window_hours: window!,
      ...(lead === null ? {} : { item_lead_hours: lead }),
      food_orders_enabled: checked(form, "orders"),
    })
    .eq("id", org.id)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.managers };
  revalidatePath("/app", "layout");
  return { ok: t.m.kitchenSettings.saved };
}

/** Add food to the rate card: a trial, food by the kilo, or an item made to order. Owners and managers. */
export async function addFoodProduct(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.kitchenSettings.errors;
  if (!canManage) return { error: e.managers };
  const kind = z.enum(FOOD_PRODUCT_KINDS).safeParse(form.get("kind"));
  if (!kind.success) return { error: t.m.errors.missing };
  const name = z.string().trim().min(1).max(80).safeParse(text(form, "name") ?? "");
  if (!name.success) return { error: e.name };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: e.price };
  const trialText = text(form, "trialKg");
  const trialGrams = kind.data === "trial" ? parseKgToGrams(trialText ?? "") : null;
  if (kind.data === "trial" && (trialGrams === null || trialGrams % 10 !== 0)) return { error: e.trialGrams };
  const taxText = text(form, "tax");
  const tax = taxText === null ? null : parsePercentBp(taxText);
  if (taxText !== null && tax === null) return { error: e.tax };
  const code = text(form, "code");
  if (code !== null && !/^\d{4,8}$/.test(code)) return { error: e.code };
  const supabase = await createClient();
  const { error } = await supabase.from("food_products").insert({
    org_id: org.id,
    kind: kind.data,
    name: name.data,
    price_minor: price,
    trial_grams: trialGrams,
    tax_rate_bp: tax,
    sac_code: code,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.kitchenSettings.priceAdded, { name: name.data }) };
}

/** Stop selling a food. Deliveries already made keep their price. Owners and managers. */
export async function stopFoodProduct(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.kitchenSettings.errors.managers };
  const id = z.uuid().safeParse(form.get("productId"));
  if (!id.success) return { error: t.m.errors.notFound };
  const supabase = await createClient();
  const { error } = await supabase.from("food_products").update({ is_active: false }).eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.kitchenSettings.stopped };
}
