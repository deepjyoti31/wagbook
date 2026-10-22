"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/** A whole number from a form within a range, nothing when empty, or undefined when it is not one. */
function whole(value: string | null, min: number, max: number): number | null | undefined {
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : undefined;
}

/** Save what the kennel checks at the door (M40): refuse, warn or nothing, and the deworming, tick and neutering rules. Owners and managers. */
export async function saveHealthRules(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.healthSetup;
  if (!canManage) return { error: w.viewOnly };
  const mode = z.enum(["off", "warn", "refuse"]).catch("off").parse(form.get("mode"));
  const deworm = whole(text(form, "dewormDays"), 1, 730);
  const tick = whole(text(form, "tickDays"), 1, 730);
  const neuter = whole(text(form, "neuterMonths"), 1, 120);
  if (deworm === undefined || tick === undefined) return { error: w.errors.days };
  if (neuter === undefined) return { error: w.errors.months };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({ health_check: mode, deworm_days: deworm, tick_days: tick, neuter_months: neuter })
    .eq("id", org.id)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: w.viewOnly };
  revalidatePath("/app", "layout");
  return { ok: w.saved };
}

/** Require a vaccine at the door, with how many months it lasts. Owners and managers. */
export async function addRequiredVaccine(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.healthSetup;
  if (!canManage) return { error: w.viewOnly };
  const vaccine = text(form, "vaccine");
  if (!vaccine || vaccine.length > 60) return { error: w.errors.vaccine };
  const months = whole(text(form, "months"), 1, 60);
  if (months === undefined || months === null) return { error: w.errors.vaccineMonths };
  const supabase = await createClient();
  const { error } = await supabase.from("required_vaccines").insert({ org_id: org.id, vaccine, months_valid: months });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more/health");
  return { ok: fill(w.added, { vaccine }) };
}

/** Stop requiring a vaccine. Deleting is for owners (D29). */
export async function removeRequiredVaccine(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete } = await requireOrg();
  const t = await getAppI18n();
  if (!canDelete) return { error: t.m.errors.ownersDelete };
  const id = z.uuid().safeParse(form.get("vaccineId"));
  if (!id.success) return { error: t.m.errors.notFound };
  const supabase = await createClient();
  const { error } = await supabase.from("required_vaccines").delete().eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more/health");
  return { ok: t.m.healthSetup.removed };
}
