"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isSacCode, parseMoney, parseRatePercent } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/** The tax rate and service code typed for an extra (D35), or the sentence saying what is wrong. Empty rate: the usual rate. */
function extraTax(form: FormData, e: { rate: string; sac: string }): { tax_rate_bp: number | null; sac_code: string | null } | { error: string } {
  const rate = parseRatePercent(text(form, "rate"));
  if (rate === undefined) return { error: e.rate };
  const sac = text(form, "sac");
  if (sac !== null && !isSacCode(sac)) return { error: e.sac };
  return { tax_rate_bp: rate, sac_code: sac };
}

/** Add an extra to the price list: grooming, pick-up and drop, a bath. Owners and managers. */
export async function addExtraService(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.extras.errors;
  if (!canManage) return { error: e.onlyManagers };
  const name = text(form, "name");
  if (!name) return { error: e.what };
  if (name.length > 80) return { error: e.tooLong };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: e.price };
  const unit = form.get("unit") === "hour" ? "hour" : "each";
  const tax = extraTax(form, e);
  if ("error" in tax) return tax;

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({ org_id: org.id, kind: "addon", name, unit, price_minor: price, ...tax });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.extras.added, { name }) };
}

/** Change an extra's price, tax rate and code. Bookings that already have it keep what they were given. */
export async function changeExtraPrice(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.extras.errors;
  if (!canManage) return { error: e.onlyManagers };
  const id = Id.safeParse(form.get("serviceId"));
  if (!id.success) return { error: e.notFound };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: e.price };
  // The rate and code boxes are shown only when the kennel charges tax.
  const tax = form.has("rate") ? extraTax(form, e) : null;
  if (tax && "error" in tax) return tax;
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").update({ price_minor: price, ...(tax ?? {}) }).eq("org_id", org.id).eq("id", id.data).eq("kind", "addon").select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  revalidatePath("/app", "layout");
  return { ok: form.has("rate") ? t.m.extras.saved : t.m.extras.priceChanged };
}

/** Take an extra off the price list. Past bookings that used it are not changed. */
export async function removeExtraService(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.extras.errors;
  if (!canManage) return { error: e.onlyManagers };
  const id = Id.safeParse(form.get("serviceId"));
  if (!id.success) return { error: e.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").update({ is_active: false }).eq("org_id", org.id).eq("id", id.data).eq("kind", "addon").select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  revalidatePath("/app", "layout");
  return { ok: t.m.extras.removed };
}

/** Add a day boarding pack to sell (D37): so many days, at a price, to use within so many days. Owners and managers. */
export async function addDayPack(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.extras.errors;
  if (!canManage) return { error: e.onlyManagers };
  const name = text(form, "name");
  if (!name || name.length > 80) return { error: e.packName };
  const days = Number(text(form, "days"));
  if (!Number.isInteger(days) || days < 1 || days > 365) return { error: e.packDays };
  const valid = Number(text(form, "valid_days"));
  if (!Number.isInteger(valid) || valid < 1 || valid > 730) return { error: e.packValid };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: e.price };
  const tax = form.has("rate") ? extraTax(form, e) : null;
  if (tax && "error" in tax) return tax;
  const supabase = await createClient();
  const { error } = await supabase.from("day_packs").insert({ org_id: org.id, name, days, valid_days: valid, price_minor: price, ...(tax ?? {}) });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.extras.packAdded, { name }) };
}

/** Take a pack off the list. Packs already sold keep working. */
export async function removeDayPack(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.extras.errors;
  if (!canManage) return { error: e.onlyManagers };
  const id = Id.safeParse(form.get("packId"));
  if (!id.success) return { error: e.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("day_packs").update({ is_active: false }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  revalidatePath("/app", "layout");
  return { ok: t.m.extras.packRemoved };
}
