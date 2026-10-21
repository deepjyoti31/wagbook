"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, parseQuantity } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/** Read the rotation place and keeping days shared by adding and changing a recipe. */
function readSettings(form: FormData, e: { place: string; days: string }) {
  const placeText = text(form, "place");
  const place = placeText === null ? null : Number(placeText);
  if (place !== null && (!Number.isInteger(place) || place < 1 || place > 50)) return { error: e.place };
  const days = Number(text(form, "useByDays") ?? "3");
  if (!Number.isInteger(days) || days < 1 || days > 60) return { error: e.days };
  return { place, days, storage: text(form, "storage")?.slice(0, 200) ?? null };
}

/** Add a recipe, then open it to say what goes in it. Owners and managers. */
export async function addRecipe(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.recipes.errors;
  if (!canManage) return { error: e.managers };
  const name = z.string().trim().min(1).max(80).safeParse(text(form, "name") ?? "");
  if (!name.success) return { error: e.name };
  const settings = readSettings(form, e);
  if ("error" in settings) return settings;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .insert({ org_id: org.id, name: name.data, rotation_position: settings.place, use_by_days: settings.days, storage_note: settings.storage })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/kitchen", "layout");
  redirect(`/app/kitchen/recipes/${data.id}?done=added`);
}

/** Change a recipe's place in the rotation, how long it keeps and how to store it. Owners and managers. */
export async function updateRecipe(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.recipes.errors;
  if (!canManage) return { error: e.managers };
  const id = Id.safeParse(form.get("recipeId"));
  if (!id.success) return { error: e.notFound };
  const settings = readSettings(form, e);
  if ("error" in settings) return settings;
  const retire = form.get("intent") === "retire";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("recipes")
    .update(
      retire
        ? { is_retired: true, rotation_position: null }
        : { rotation_position: settings.place, use_by_days: settings.days, storage_note: settings.storage },
    )
    .eq("org_id", org.id)
    .eq("id", id.data)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  revalidatePath("/app/kitchen", "layout");
  return { ok: retire ? t.m.recipePage.retiredDone : t.m.recipes.saved };
}

const whole = (value: string | null, max: number) => {
  if (value === null) return null;
  if (!/^\d{1,6}$/.test(value) || Number(value) > max) return undefined;
  return Number(value);
};

/**
 * A new version of a recipe: what goes into a kilo of cooked food, and its
 * details. The database makes it in one step and refuses anything a dog must
 * never eat (save_recipe_version, WB140).
 */
export async function saveVersion(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.recipePage.errors;
  if (!canManage) return { error: t.m.recipes.errors.managers };
  const id = Id.safeParse(form.get("recipeId"));
  if (!id.success) return { error: t.m.recipes.errors.notFound };
  const supabase = await createClient();
  const items = await supabase.from("stock_items").select("id, unit").eq("org_id", org.id);
  if (items.error) return { error: friendlyError(items.error, t) };
  const unitOf = new Map(items.data.map((i) => [i.id, i.unit]));

  const ingredients = new Map<string, number>();
  for (let i = 0; i < 20; i++) {
    const item = text(form, `item_${i}`);
    const quantity = text(form, `qty_${i}`);
    if (!item && !quantity) continue;
    const unit = item ? unitOf.get(item) : undefined;
    const q = unit && quantity ? parseQuantity(quantity, unit) : null;
    if (!unit || q === null) return { error: e.ingredient };
    ingredients.set(item!, (ingredients.get(item!) ?? 0) + q);
  }
  if (ingredients.size === 0) return { error: e.none };

  const yieldG = whole(text(form, "yieldG"), 2000);
  const kcal = whole(text(form, "kcal"), 10000);
  const protein = whole(text(form, "protein"), 1000);
  if (yieldG === undefined || kcal === undefined || protein === undefined || (yieldG !== null && yieldG < 100)) return { error: e.number };
  const dates = ["signedOffOn", "labTestedOn"].map((k) => text(form, k));
  if (dates.some((d) => d !== null && !isISODate(d))) return { error: e.date };

  const { data, error } = await supabase.rpc("save_recipe_version", {
    p_recipe: id.data,
    p_details: {
      good_for: text(form, "goodFor")?.slice(0, 500) ?? null,
      cooked_yield_bp: yieldG === null ? null : yieldG * 10,
      kcal_per_kg: kcal,
      protein_g_per_kg: protein,
      signed_off_by: text(form, "signedOffBy")?.slice(0, 120) ?? null,
      signed_off_on: dates[0],
      lab_tested_on: dates[1],
    },
    p_ingredients: [...ingredients.entries()].map(([item_id, quantity_per_kg]) => ({ item_id, quantity_per_kg })),
  });
  if (error) return { error: friendlyError(error, t) };
  const version = await supabase.from("recipe_versions").select("version").eq("org_id", org.id).eq("id", data).single();
  revalidatePath("/app/kitchen", "layout");
  return { ok: fill(t.m.recipePage.versionSaved, { n: version.data?.version ?? "" }) };
}
