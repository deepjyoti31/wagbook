"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, parseMoney, todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Phase 6 (M50 to M57, D52): kennels to clean, house jobs, a pet that has
 * passed away and flowers, a parent's own supplies, trial days, the stay
 * report and vet visits. The database holds every rule; these give a nicer
 * sentence first.
 */

const Id = z.uuid();
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/;
const wholeNumber = (value: string | null) => (value && /^\d{1,7}$/.test(value) && Number(value) > 0 ? Number(value) : null);

/** A kennel is clean again (M50). The database stamps who and when. */
export async function markCleaned(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("cleanId"));
  if (!id.success) return { error: t.m.cleaning.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kennel_cleans")
    .update({ cleaned_at: new Date().toISOString() })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .is("cleaned_at", null)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.cleaning.notFound };
  revalidatePath("/app", "layout");
  // The row goes with its form, so Today says it instead.
  redirect("/app?done=cleaned");
}

/** Tick a house job done today, or put it back (M51). Anyone. */
export async function tickHouseJob(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("jobId"));
  if (!id.success) return { error: t.m.house.errors.job };
  const undo = form.get("undo") === "1";
  const supabase = await createClient();
  const { error } = await supabase
    .from("house_job_days")
    .upsert({ org_id: org.id, job_id: id.data, job_date: todayIn(org.time_zone), status: undo ? "pending" : "done" }, { onConflict: "org_id,job_id,job_date" });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return {};
}

/**
 * Flowers sent to the family of a pet that has passed away (M52). An owner or
 * manager may write what they cost as an expense, in the same step.
 */
export async function markFlowersSent(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.passing.flowers;
  const id = Id.safeParse(form.get("petId"));
  if (!id.success) return { error: t.m.errors.petNotFound };
  const costText = text(form, "cost");
  const cost = costText ? parseMoney(costText) : null;
  if (costText && (cost === null || cost <= 0)) return { error: t.m.house.errors.cost };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pets")
    .update({ flowers_sent_at: new Date().toISOString() })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .not("passed_away_on", "is", null)
    .select("name");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.errors.petNotFound };
  if (cost && canManage) {
    const expense = await supabase.from("expenses").insert({
      org_id: org.id,
      spent_on: todayIn(org.time_zone),
      category: w.category,
      description: data[0].name,
      amount_minor: cost,
    });
    if (expense.error) return { error: friendlyError(expense.error, t) };
  }
  revalidatePath("/app", "layout");
  redirect("/app?done=flowers");
}

/** Mark a pet as passed away on a day (M52). Owners and managers (the database refuses anyone else, WB251). */
export async function markPassedAway(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.passing;
  if (!canManage) return { error: w.managersOnly };
  const id = Id.safeParse(form.get("petId"));
  if (!id.success) return { error: t.m.errors.petNotFound };
  const day = text(form, "day");
  if (!day || !isISODate(day) || day > todayIn(org.time_zone)) return { error: w.errors.date };
  const supabase = await createClient();
  const { data, error } = await supabase.from("pets").update({ passed_away_on: day }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.errors.petNotFound };
  revalidatePath("/app", "layout");
  redirect(`/app/dogs/${id.data}?done=passed`);
}

/** Undo a passing marked by mistake, within a week (M52, WB253). Nothing cancelled comes back. */
export async function undoPassedAway(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.passing.managersOnly };
  const id = Id.safeParse(form.get("petId"));
  if (!id.success) return { error: t.m.errors.petNotFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("pets").update({ passed_away_on: null }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.errors.petNotFound };
  revalidatePath("/app", "layout");
  redirect(`/app/dogs/${id.data}?done=unpassed`);
}

/** Food or a medicine the parent brought for the stay (M55). Anyone. */
export async function addSupply(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.supplies.errors;
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: t.m.errors.bookingNotFound };
  const kind = form.get("kind");
  if (kind !== "food" && kind !== "medicine") return { error: e.kind };
  const label = text(form, "label");
  if (!label || label.length > 80) return { error: e.label };
  const brought = wholeNumber(text(form, "brought"));
  const perTask = wholeNumber(text(form, "perTask"));
  if (!brought || !perTask) return { error: e.amount };
  const routineText = text(form, "routineId");
  const routine = routineText ? Id.safeParse(routineText) : null;
  if (routine && !routine.success) return { error: e.routine };

  const supabase = await createClient();
  const booking = await supabase.from("bookings").select("pet_id").eq("org_id", org.id).eq("id", bookingId.data).maybeSingle();
  if (booking.error || !booking.data) return { error: t.m.errors.bookingNotFound };
  const { error } = await supabase.from("stay_supplies").insert({
    org_id: org.id,
    booking_id: bookingId.data,
    pet_id: booking.data.pet_id,
    kind,
    label,
    brought,
    per_task: perTask,
    care_item_id: routine?.success ? routine.data : null,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.supplies.added, { label }) };
}

/** Mark day boarding as a trial day for a new dog, or not (M56). Anyone. */
export async function setTrial(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: t.m.errors.bookingNotFound };
  const on = form.get("trial") === "1";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update(on ? { is_trial: true } : { is_trial: false, trial_outcome: null, trial_note: null })
    .eq("org_id", org.id)
    .eq("id", bookingId.data)
    .eq("kind", "daycare")
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.trial.errors.onlyDays };
  revalidatePath("/app", "layout");
  return { ok: on ? t.m.trial.marked : t.m.trial.unmarked };
}

const OUTCOMES = ["settled", "anxious", "reactive"] as const;

/** How the dog settled on its trial day, and a sentence (M56). Anyone. */
export async function saveTrialOutcome(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.trial.errors;
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: t.m.errors.bookingNotFound };
  const outcome = OUTCOMES.find((o) => o === form.get("outcome"));
  if (!outcome) return { error: e.outcome };
  const note = text(form, "note");
  if (note && note.length > 300) return { error: e.note };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ trial_outcome: outcome, trial_note: note })
    .eq("org_id", org.id)
    .eq("id", bookingId.data)
    .eq("is_trial", true)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.onlyDays };
  revalidatePath("/app", "layout");
  return { ok: t.m.trial.saved };
}

/** A few words and the photos picked for the parent's stay report (M53). Anyone. */
export async function saveStayReport(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.stayReport.errors;
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: t.m.errors.bookingNotFound };
  const words = text(form, "words");
  if (words && words.length > 1000) return { error: e.words };
  const photos = form.getAll("photos").filter((p): p is string => typeof p === "string" && p.startsWith(`${org.id}/`));
  if (photos.length > 6) return { error: e.photos };
  const supabase = await createClient();
  const { error } = await supabase
    .from("stay_reports")
    .upsert({ org_id: org.id, booking_id: bookingId.data, words, photo_paths: photos }, { onConflict: "org_id,booking_id" });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.stayReport.saved };
}

const medicine = z.object({ label: z.string().min(1).max(80), details: z.string().max(300).nullable(), due_time: z.string().regex(CLOCK) });

/**
 * A vet visit during a stay, in one step (M57): the visit, its cost on the
 * stay's bill and (for an owner or manager) in the expenses, and each medicine
 * the vet gave on the pet's routine, so its tasks start today.
 */
export async function recordVetVisit(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.vet;
  const e = w.errors;
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: t.m.errors.bookingNotFound };
  const day = text(form, "day");
  if (!day || !isISODate(day) || day > todayIn(org.time_zone)) return { error: e.date };
  const reason = text(form, "reason");
  if (!reason || reason.length > 300) return { error: e.reason };
  const vet = text(form, "vet");
  if (vet && vet.length > 120) return { error: e.vet };
  const findings = text(form, "findings");
  if (findings && findings.length > 2000) return { error: e.findings };
  const costText = text(form, "cost");
  const cost = costText ? parseMoney(costText) : 0;
  if (cost === null || cost < 0) return { error: e.cost };
  const medicines = [];
  for (const n of [1, 2, 3]) {
    const label = text(form, `med${n}`);
    const at = text(form, `med${n}Time`);
    if (!label && !at) continue;
    const parsed = medicine.safeParse({ label: label ?? "", details: text(form, `med${n}How`), due_time: at ?? "" });
    if (!parsed.success) return { error: e.medicine };
    medicines.push(parsed.data);
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("record_vet_visit", {
    p_org: org.id,
    p_booking: bookingId.data,
    p_visited_on: day,
    p_reason: reason,
    p_vet: vet ?? "",
    p_findings: findings ?? "",
    p_cost_minor: cost,
    p_line: fill(w.line, { reason }),
    p_category: w.category,
    p_medicines: medicines,
  });
  if (error) return { error: friendlyError(error, t) };
  if (medicines.length > 0) {
    const tasks = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: todayIn(org.time_zone) });
    if (tasks.error) console.error("generate_care_tasks failed", tasks.error.message);
  }
  revalidatePath("/app", "layout");
  return { ok: w.saved };
}

/** Write a repair's or a vet visit's cost as an expense (M51, M57). Owners and managers (WB002). */
export async function costToExpense(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const kind = form.get("kind") === "vet" ? "vet" : "repair";
  const id = Id.safeParse(form.get("id"));
  if (!id.success) return { error: t.m.errors.notFound };
  const supabase = await createClient();
  const { error } = await supabase.rpc("cost_to_expense", {
    p_org: org.id,
    p_kind: kind,
    p_id: id.data,
    p_category: kind === "vet" ? t.m.vet.category : t.m.house.repairs.expenseCategory,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: kind === "vet" ? t.m.vet.written : t.m.house.repairs.written };
}
