"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { STARTER_ROUTINES } from "@/lib/care";
import { todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const Routine = z.object({
  kind: z.enum(["meal", "medication", "walk", "play", "cleaning", "other"], "Choose what kind of care it is."),
  label: z.string().min(1, "Say what it is, like Breakfast or Tablet.").max(80, "Keep the name under 80 characters."),
  details: z.string().max(500, "Keep the details under 500 characters.").nullable(),
  dueTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Enter a time like 09:00."),
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
  const note = text(form, "note");
  if (note && note.length > 500) return { error: "Keep the note under 500 characters." };
  if (form.get("kind") === "medication" && !note) return { error: "Say why the medicine was not given. The parent and the next shift need to know." };
  return setTaskStatus(form, "skipped", ["pending"], note);
}

async function setTaskStatus(form: FormData, to: "done" | "pending" | "skipped", from: ("pending" | "done" | "skipped")[], note?: string | null): Promise<FormState> {
  const { org } = await requireOrg();
  const id = Id.safeParse(form.get("taskId"));
  if (!id.success) return { error: "That task could not be found." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("care_tasks")
    .update({ status: to, ...(note !== undefined ? { note } : to === "pending" ? { note: null } : {}) })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .in("status", from);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return {};
}

/** Add a routine: a house routine for every pet (owners and managers), or one pet's own (anyone). */
export async function addRoutine(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const petText = text(form, "petId");
  const petId = petText === null ? null : Id.safeParse(petText);
  if (petId && !petId.success) return { error: "That pet could not be found." };
  if (!petId && !canManage) return { error: "Only an owner or manager can change the house routines." };

  const parsed = Routine.safeParse({ kind: form.get("kind"), label: text(form, "label") ?? "", details: text(form, "details"), dueTime: text(form, "dueTime") ?? "" });
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
  });
  if (error) return { error: friendlyError(error) };

  // A new routine starts today for pets already in house. Safe to repeat.
  const tasks = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: todayIn(org.time_zone) });
  if (tasks.error) console.error("generate_care_tasks failed", tasks.error.message);

  revalidatePath("/app", "layout");
  return { ok: `Added ${r.label} at ${r.dueTime}.` };
}

/** Stop a routine. Tasks already made for today stay; none are made from tomorrow. */
export async function stopRoutine(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const id = Id.safeParse(form.get("routineId"));
  if (!id.success) return { error: "That routine could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("care_items").update({ is_active: false }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "Only an owner or manager can change the house routines." };
  revalidatePath("/app", "layout");
  return { ok: "Routine stopped." };
}

/** Add the starter set of house routines. */
export async function addStarterRoutines(): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can change the house routines." };
  const supabase = await createClient();
  const { error } = await supabase.from("care_items").insert(STARTER_ROUTINES.map((r, i) => ({ org_id: org.id, pet_id: null, sort_order: i, ...r })));
  if (error) return { error: friendlyError(error) };
  const tasks = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: todayIn(org.time_zone) });
  if (tasks.error) console.error("generate_care_tasks failed", tasks.error.message);
  revalidatePath("/app", "layout");
  return { ok: "Added breakfast, lunch, dinner and a kennel clean. Change the times to suit you." };
}
