"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { parseMoney } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

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

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({ org_id: org.id, kind: "addon", name, unit, price_minor: price });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.extras.added, { name }) };
}

/** Change an extra's price. Bookings that already have it keep the price they were given. */
export async function changeExtraPrice(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.extras.errors;
  if (!canManage) return { error: e.onlyManagers };
  const id = Id.safeParse(form.get("serviceId"));
  if (!id.success) return { error: e.notFound };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: e.price };
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").update({ price_minor: price }).eq("org_id", org.id).eq("id", id.data).eq("kind", "addon").select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  revalidatePath("/app", "layout");
  return { ok: t.m.extras.priceChanged };
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
