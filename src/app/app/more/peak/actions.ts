"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n, type I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/** A peak period as typed, with each refusal in the reader's language. */
function peakSchema(m: I18n["m"]) {
  const e = m.peak.errors;
  return z
    .object({
      name: z.string().min(1, e.name).max(80, e.nameTooLong),
      startDate: z.string().refine(isISODate, e.firstDay),
      endDate: z.string().refine(isISODate, e.lastDay),
      playMinutes: z.number().int().min(5, e.playMinutes).max(240, e.playMinutes).nullable(),
    })
    .refine((p) => p.endDate >= p.startDate, e.order);
}

/** Add a busy stretch: a festival, a long weekend. Owners and managers. */
export async function addPeakPeriod(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.peak.errors;
  if (!canManage) return { error: t.m.peak.viewOnly };
  const minutes = text(form, "playMinutes");
  const parsed = peakSchema(t.m).safeParse({
    name: text(form, "name") ?? "",
    startDate: text(form, "startDate") ?? "",
    endDate: text(form, "endDate") ?? "",
    playMinutes: minutes === null ? null : Number(minutes),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].path[0] === "playMinutes" ? e.playMinutes : parsed.error.issues[0].message };
  const p = parsed.data;

  const supabase = await createClient();
  const { error } = await supabase.from("peak_periods").insert({
    org_id: org.id,
    name: p.name,
    start_date: p.startDate,
    end_date: p.endDate,
    no_refund: checked(form, "noRefund"),
    play_session_minutes: p.playMinutes,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.peak.added, { name: p.name }) };
}

export async function removePeakPeriod(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.peak.viewOnly };
  const id = z.uuid().safeParse(form.get("periodId"));
  if (!id.success) return { error: t.m.peak.errors.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("peak_periods").delete().eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.peak.errors.notFound };
  revalidatePath("/app", "layout");
  return { ok: t.m.peak.removed };
}
