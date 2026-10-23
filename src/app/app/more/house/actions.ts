"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { parseMoney } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * More, Checklists and repairs (M51). Owners and managers set the checklists
 * and the cleaning that repeats (the database refuses anyone else); anyone
 * reports a repair and marks it fixed.
 */

const Id = z.uuid();
const LISTS = ["opening", "closing", "cleaning"] as const;

/** Add a job to a list. Owners and managers. */
export async function addHouseJob(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.house;
  if (!canManage) return { error: w.jobs.managersOnly };
  const list = LISTS.find((l) => l === form.get("list"));
  if (!list) return { error: w.errors.list };
  const label = text(form, "label");
  if (!label || label.length > 80) return { error: w.errors.label };
  const weekdayText = text(form, "weekday");
  const weekday = weekdayText && /^[1-7]$/.test(weekdayText) ? Number(weekdayText) : null;
  const time = text(form, "time");
  if (time && !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: w.errors.time };
  const supabase = await createClient();
  const { error } = await supabase.from("house_jobs").insert({ org_id: org.id, list, label, weekday, due_time: time });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(w.jobs.added, { job: label }) };
}

/** The usual opening and closing checklists and a daily yard clean, to change afterwards. Owners and managers. */
export async function addUsualHouseJobs(): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.house.jobs;
  if (!canManage) return { error: w.managersOnly };
  const rows = LISTS.flatMap((list) => w.usual[list].map((label, i) => ({ org_id: org.id, list, label, sort_order: i })));
  const supabase = await createClient();
  const { error } = await supabase.from("house_jobs").insert(rows);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  // The button goes once the lists exist, so the page says it instead.
  redirect("/app/more/house?done=usual");
}

/** Take a job off its list; days already ticked stay. Owners and managers. */
export async function stopHouseJob(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.house;
  if (!canManage) return { error: w.jobs.managersOnly };
  const id = Id.safeParse(form.get("jobId"));
  if (!id.success) return { error: w.errors.job };
  const supabase = await createClient();
  const { error } = await supabase.from("house_jobs").update({ is_active: false }).eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect("/app/more/house?done=stopped");
}

/** Report something broken. Anyone. */
export async function reportRepair(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.house;
  const what = text(form, "what");
  if (!what || what.length > 200) return { error: w.errors.what };
  const details = text(form, "details");
  if (details && details.length > 1000) return { error: w.errors.details };
  const supabase = await createClient();
  const { error } = await supabase.from("repairs").insert({ org_id: org.id, what, details });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: w.repairs.reported };
}

/** Mark a repair fixed, with what it cost and what was done. Anyone; the database stamps who and when. */
export async function fixRepair(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.house;
  const id = Id.safeParse(form.get("repairId"));
  if (!id.success) return { error: w.errors.repair };
  const costText = text(form, "cost");
  const cost = costText ? parseMoney(costText) : null;
  if (costText && (cost === null || cost < 0)) return { error: w.errors.cost };
  const note = text(form, "note");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("repairs")
    .update({ fixed_at: new Date().toISOString(), cost_minor: cost, fixed_note: note ? note.slice(0, 300) : null })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .is("fixed_at", null)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: w.errors.repair };
  revalidatePath("/app", "layout");
  // It moves to the fixed list with its form, so the page says it instead.
  redirect("/app/more/house?done=fixed");
}
