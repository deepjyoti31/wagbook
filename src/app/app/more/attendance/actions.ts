"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { clockTime, localClock, stretchFrom } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/** Clock in now (M43). The database stamps the time; a second open stretch is refused. */
export async function clockIn(): Promise<FormState> {
  const { org, user } = await requireOrg();
  const t = await getAppI18n();
  if (!org.keeps_rota) return { error: t.m.attendance.off };
  const supabase = await createClient();
  const { data, error } = await supabase.from("attendance").insert({ org_id: org.id, user_id: user.id }).select("clocked_in_at").single();
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.onNow.clockedInAt, { time: localClock(data.clocked_in_at, org.time_zone) }) };
}

/** Clock out now: the open stretch of the signed-in person. The database stamps the time. */
export async function clockOut(): Promise<FormState> {
  const { org, user } = await requireOrg();
  const t = await getAppI18n();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .update({ clocked_out_at: new Date().toISOString() })
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .is("clocked_out_at", null)
    .select("clocked_out_at");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0 || !data[0].clocked_out_at) return { error: t.m.onNow.notOn };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.onNow.clockedOutAt, { time: localClock(data[0].clocked_out_at, org.time_zone) }) };
}

/** Times typed for one stretch: the day, in and perhaps out on the kennel's clock, and why. */
function typedStretch(form: FormData, timeZone: string, e: { day: string; time: string; note: string }): { in: string; out: string | null; note: string } | { error: string } {
  const day = text(form, "day");
  const timeIn = clockTime(form.get("in"));
  const outText = text(form, "out");
  const timeOut = outText ? clockTime(outText) : null;
  if (!timeIn || (outText && !timeOut)) return { error: e.time };
  const note = text(form, "note");
  if (!note || note.length > 300) return { error: e.note };
  const span = day ? stretchFrom(day, timeIn, timeOut, timeZone) : null;
  if (!span) return { error: e.day };
  return { ...span, note };
}

/** Write a stretch by hand for someone who forgot to clock in. Owners and managers, with a note (the database checks both). */
export async function addStretch(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.attendance.errors;
  if (!canManage) return { error: e.managersOnly };
  const person = Id.safeParse(form.get("userId"));
  if (!person.success) return { error: e.person };
  const typed = typedStretch(form, org.time_zone, e);
  if ("error" in typed) return typed;
  const supabase = await createClient();
  const { error } = await supabase
    .from("attendance")
    .insert({ org_id: org.id, user_id: person.data, clocked_in_at: typed.in, clocked_out_at: typed.out, note: typed.note });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.attendance.byHand.saved };
}

/** Put a stretch's times right, such as a clock-out that was forgotten. Owners and managers, with a note. */
export async function changeStretch(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.attendance.errors;
  if (!canManage) return { error: e.managersOnly };
  const id = Id.safeParse(form.get("stretchId"));
  if (!id.success) return { error: e.notFound };
  const typed = typedStretch(form, org.time_zone, e);
  if ("error" in typed) return typed;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("attendance")
    .update({ clocked_in_at: typed.in, clocked_out_at: typed.out, note: typed.note })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  revalidatePath("/app", "layout");
  return { ok: t.m.attendance.byHand.saved };
}
