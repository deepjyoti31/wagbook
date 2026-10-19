"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill, plural } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Bulk = z.object({
  prefix: z.string().max(20),
  count: z.coerce.number().int().min(1).max(200),
  startAt: z.coerce.number().int().min(0).max(9999),
});

/**
 * Add a run of kennels in one go: prefix "K", 60 kennels, starting at 1 gives
 * K01 to K60. Names that already exist are left alone, so it is safe to repeat.
 */
export async function addKennels(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.kennels.errors;
  const parsed = Bulk.safeParse({ prefix: text(form, "prefix") ?? "", count: form.get("count"), startAt: form.get("startAt") ?? 1 });
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const field = issue.path[0];
    if (field === "count") return { error: issue.code === "too_big" ? e.atMost : e.atLeastOne };
    return { error: field === "prefix" ? e.prefix : e.startAt };
  }
  const { prefix, count, startAt } = parsed.data;

  const width = Math.max(2, String(startAt + count - 1).length);
  const rows = Array.from({ length: count }, (_, i) => ({
    org_id: org.id,
    name: `${prefix}${String(startAt + i).padStart(width, "0")}`,
    sort_order: startAt + i,
  }));

  const supabase = await createClient();
  const { data, error } = await supabase.from("kennels").upsert(rows, { onConflict: "org_id,name", ignoreDuplicates: true }).select("id");
  if (error) return { error: friendlyError(error, t) };

  revalidatePath("/app", "layout");
  const added = data.length;
  return { ok: added === 0 ? t.m.kennels.alreadyExist : plural(t.language, added, t.m.kennels.added) };
}

export async function setKennelActive(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = z.uuid().safeParse(form.get("kennelId"));
  if (!id.success) return { error: t.m.kennels.errors.notFound };
  const active = form.get("active") === "true";

  const supabase = await createClient();
  const { data, error } = await supabase.from("kennels").update({ is_active: active }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.kennels.errors.onlyManagers };

  revalidatePath("/app", "layout");
  return {};
}

const One = z.object({
  name: z.string().trim().min(1).max(40),
  position: z.coerce.number().int().min(0).max(9999),
});

/** Add one kennel with a name of the kennel's choosing, at the end of the list unless a position is given. */
export async function addKennel(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.kennels.errors;
  const supabase = await createClient();
  const last = await supabase.from("kennels").select("sort_order").eq("org_id", org.id).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  if (last.error) return { error: friendlyError(last.error, t) };
  const parsed = One.safeParse({ name: text(form, "name") ?? "", position: Math.min((last.data?.sort_order ?? 0) + 1, 9999) });
  if (!parsed.success) return { error: e.name };

  const { error } = await supabase.from("kennels").insert({ org_id: org.id, name: parsed.data.name, sort_order: parsed.data.position });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.kennels.addedOne, { kennel: parsed.data.name }) };
}

/** Rename a kennel, or move it in the list (the order the care round walks). Owners and managers (the update policy). */
export async function changeKennel(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.kennels.errors;
  const id = z.uuid().safeParse(form.get("kennelId"));
  if (!id.success) return { error: e.notFound };
  const parsed = One.safeParse({ name: text(form, "name") ?? "", position: text(form, "position") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].path[0] === "name" ? e.name : e.position };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kennels")
    .update({ name: parsed.data.name, sort_order: parsed.data.position })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.onlyManagers };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.kennels.saved, { kennel: parsed.data.name }) };
}
