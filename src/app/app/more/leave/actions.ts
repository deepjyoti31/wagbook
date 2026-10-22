"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { diffDays, isISODate } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/**
 * Ask for leave (M43). Anyone asks for their own; an owner or manager may put
 * it in for someone else, and as already granted. The database decides who
 * may grant (never their own leave, unless an owner).
 */
export async function askLeave(_state: FormState, form: FormData): Promise<FormState> {
  const { org, user, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.leave;
  const forWhom = canManage ? Id.safeParse(form.get("userId") ?? user.id) : Id.safeParse(user.id);
  if (!forWhom.success) return { error: w.errors.person };
  const from = text(form, "from");
  const to = text(form, "to") ?? from;
  if (!isISODate(from) || !isISODate(to) || to < from || diffDays(from, to) > 91) return { error: w.errors.dates };
  const reason = text(form, "reason");
  if (reason && reason.length > 300) return { error: w.errors.reason };
  const granted = canManage && checked(form, "granted");

  const supabase = await createClient();
  const { error } = await supabase
    .from("leave_requests")
    .insert({ org_id: org.id, user_id: forWhom.data, starts_on: from, ends_on: to, reason, status: granted ? "granted" : "asked" });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: granted ? w.ask.doneGranted : w.ask.done };
}

/** Grant or refuse leave that is asked for. Owners and managers, not their own (the database checks). */
export async function answerLeave(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.leave;
  const id = Id.safeParse(form.get("leaveId"));
  if (!id.success) return { error: w.errors.notFound };
  const status = form.get("decision") === "granted" ? "granted" : "refused";
  const answer = text(form, "answer");
  if (answer && answer.length > 300) return { error: w.errors.reason };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status, answer })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .eq("status", "asked")
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: w.errors.notFound };
  revalidatePath("/app", "layout");
  // The request leaves the waiting list, and its form with it: say it on the page.
  redirect(`/app/more/leave?done=${status}`);
}

/** Take back leave asked for or granted: the person's own, or anyone's for an owner or manager. */
export async function withdrawLeave(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.leave;
  const id = Id.safeParse(form.get("leaveId"));
  if (!id.success) return { error: w.errors.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("leave_requests")
    .update({ status: "withdrawn" })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .in("status", ["asked", "granted"])
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: w.errors.notFound };
  revalidatePath("/app", "layout");
  redirect("/app/more/leave?done=withdrawn");
}
