"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const Peak = z
  .object({
    name: z.string().min(1, "Give the period a name, like Diwali week.").max(80, "Keep the name under 80 characters."),
    startDate: z.string().refine(isISODate, "Choose the first day."),
    endDate: z.string().refine(isISODate, "Choose the last day."),
    playMinutes: z.number().int().min(5).max(240).nullable(),
  })
  .refine((p) => p.endDate >= p.startDate, "The last day cannot be before the first day.");

/** Add a busy stretch: a festival, a long weekend. Owners and managers. */
export async function addPeakPeriod(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can change peak periods." };
  const minutes = text(form, "playMinutes");
  const parsed = Peak.safeParse({
    name: text(form, "name") ?? "",
    startDate: text(form, "startDate") ?? "",
    endDate: text(form, "endDate") ?? "",
    playMinutes: minutes === null ? null : Number(minutes),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].path[0] === "playMinutes" ? "A play session is between 5 and 240 minutes." : parsed.error.issues[0].message };
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
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { ok: `Added ${p.name}.` };
}

export async function removePeakPeriod(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can change peak periods." };
  const id = z.uuid().safeParse(form.get("periodId"));
  if (!id.success) return { error: "That period could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("peak_periods").delete().eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "That period could not be found." };
  revalidatePath("/app", "layout");
  return { ok: "Removed." };
}
