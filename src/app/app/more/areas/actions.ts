"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { normalizePostalCode, parseMoney } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import type { Messages } from "@/messages";
import { createClient } from "@/lib/supabase/server";

type Area = { postal_code: string; name: string; delivery_charge_minor: number | null };

/** Read the area form: a PIN code (six digits in India), a name and an optional charge. */
function readArea(form: FormData, m: Messages, country: string): { error: string } | { area: Area } {
  const e = m.areas.errors;
  const postal = normalizePostalCode(text(form, "postalCode") ?? "", country);
  if (!postal) return { error: country === "IN" ? e.pin : e.postalCode };
  const name = z.string().trim().min(1).max(80).safeParse(text(form, "name") ?? "");
  if (!name.success) return { error: e.name };
  const typed = text(form, "charge");
  const charge = typed === null ? null : parseMoney(typed);
  if (charge !== null && charge < 0) return { error: e.charge };
  if (typed !== null && charge === null) return { error: e.charge };
  return { area: { postal_code: postal, name: name.data, delivery_charge_minor: charge } };
}

/** Add a PIN code the kennel delivers to. Owners and managers (the policy decides). */
export async function addArea(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.areas.errors.onlyManagers };
  const read = readArea(form, t.m, org.country_code);
  if ("error" in read) return read;
  const supabase = await createClient();
  const { error } = await supabase.from("service_areas").insert({ org_id: org.id, ...read.area });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more/areas");
  return { ok: fill(t.m.areas.added, { name: read.area.name }) };
}

/** Change an area's PIN code, name or charge. Owners and managers. */
export async function changeArea(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = z.uuid().safeParse(form.get("areaId"));
  if (!id.success) return { error: t.m.areas.errors.notFound };
  const read = readArea(form, t.m, org.country_code);
  if ("error" in read) return read;
  const supabase = await createClient();
  const { data, error } = await supabase.from("service_areas").update(read.area).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.areas.errors.onlyManagers };
  revalidatePath("/app/more/areas");
  return { ok: fill(t.m.areas.saved, { name: read.area.name }) };
}

/** Stop serving an area. Deleting is for owners (D29). */
export async function removeArea(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete } = await requireOrg();
  const t = await getAppI18n();
  if (!canDelete) return { error: t.m.errors.ownersDelete };
  const id = z.uuid().safeParse(form.get("areaId"));
  if (!id.success) return { error: t.m.areas.errors.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("service_areas").delete().eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.areas.errors.notFound };
  revalidatePath("/app/more/areas");
  return { ok: t.m.areas.removed };
}
