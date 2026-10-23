"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { starterRoutines } from "@/lib/care";
import { todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { fill } from "@/lib/i18n";
import { getAppI18n, type I18n } from "@/lib/i18n-server";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const routineSchema = (r: I18n["m"]["routines"]) =>
  z.object({
    kind: z.enum(["meal", "medication", "walk", "play", "cleaning", "other"], r.chooseKind),
    label: z.string().min(1, r.nameIt).max(80, r.nameTooLong),
    details: z.string().max(500, r.detailsTooLong).nullable(),
    dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, r.timeLike),
  });

/**
 * Tick a task done. Safe to tap twice: the second tap finds nothing pending
 * and says nothing, and the database keeps the first who and when.
 */
export async function markDone(_state: FormState, form: FormData): Promise<FormState> {
  return setTaskStatus(form, "done", ["pending"]);
}

/** Put a done or skipped task back to be done. */
export async function undoTask(_state: FormState, form: FormData): Promise<FormState> {
  return setTaskStatus(form, "pending", ["done", "skipped"]);
}

/** Skip a task on purpose. A medicine needs a note (the database insists). */
export async function skipTask(_state: FormState, form: FormData): Promise<FormState> {
  await requireOrg();
  const { m } = await getAppI18n();
  const note = text(form, "note");
  if (note && note.length > 500) return { error: m.care.noteTooLong };
  if (form.get("kind") === "medication" && !note) return { error: m.errors.constraints.care_tasks_skipped_medication_needs_note };
  return setTaskStatus(form, "skipped", ["pending"], note);
}

async function setTaskStatus(form: FormData, to: "done" | "pending" | "skipped", from: ("pending" | "done" | "skipped")[], note?: string | null): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("taskId"));
  if (!id.success) return { error: t.m.errors.taskNotFound };
  const supabase = await createClient();
  const { error } = await supabase
    .from("care_tasks")
    .update({ status: to, ...(note !== undefined ? { note } : to === "pending" ? { note: null } : {}) })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .in("status", from);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return {};
}

/** Add a routine: a house routine for every pet (owners and managers), or one pet's own (anyone). */
export async function addRoutine(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const petText = text(form, "petId");
  const petId = petText === null ? null : Id.safeParse(petText);
  if (petId && !petId.success) return { error: t.m.errors.petNotFound };
  if (!petId && !canManage) return { error: t.m.routines.onlyManagers };

  const parsed = routineSchema(t.m.routines).safeParse({ kind: form.get("kind"), label: text(form, "label") ?? "", details: text(form, "details"), dueTime: text(form, "dueTime") ?? "" });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const r = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("care_items").insert({
    org_id: org.id,
    pet_id: petId ? petId.data : null,
    kind: r.kind,
    label: r.label,
    details: r.details,
    due_time: r.dueTime,
    needs_photo: form.get("needsPhoto") === "on",
  });
  if (error) return { error: friendlyError(error, t) };

  // A new routine starts today for pets already in house. Safe to repeat.
  const tasks = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: todayIn(org.time_zone) });
  if (tasks.error) console.error("generate_care_tasks failed", tasks.error.message);

  revalidatePath("/app", "layout");
  return { ok: fill(t.m.routines.added, { label: r.label, time: r.dueTime }) };
}

/** Stop a routine. Tasks already made for today stay; none are made from tomorrow. */
export async function stopRoutine(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("routineId"));
  if (!id.success) return { error: t.m.routines.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("care_items").update({ is_active: false }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.routines.onlyManagers };
  revalidatePath("/app", "layout");
  return { ok: t.m.routines.stopped };
}

/** Add the starter set of house routines. */
export async function addStarterRoutines(): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.routines.onlyManagers };
  const supabase = await createClient();
  const { error } = await supabase.from("care_items").insert(starterRoutines(t.m).map((r, i) => ({ org_id: org.id, pet_id: null, sort_order: i, ...r })));
  if (error) return { error: friendlyError(error, t) };
  const tasks = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: todayIn(org.time_zone) });
  if (tasks.error) console.error("generate_care_tasks failed", tasks.error.message);
  revalidatePath("/app", "layout");
  return { ok: t.m.routines.starterAdded };
}
