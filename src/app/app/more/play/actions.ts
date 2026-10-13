"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

const Hours = z
  .object({
    sessions: z.number().int().min(0, "Play sessions a day must be between 0 and 12.").max(12, "Play sessions a day must be between 0 and 12."),
    minutes: z.number().int().min(5, "A play session is between 5 and 240 minutes.").max(240, "A play session is between 5 and 240 minutes."),
    changeover: z.number().int().min(0, "Changeover is between 0 and 60 minutes.").max(60, "Changeover is between 0 and 60 minutes."),
    dayStart: z.string().regex(clock, "Enter when the yards open, like 08:00."),
    dayEnd: z.string().regex(clock, "Enter when the yards close, like 18:00."),
    breakStart: z.string().regex(clock, "Enter a time like 12:00.").nullable(),
    breakEnd: z.string().regex(clock, "Enter a time like 16:00.").nullable(),
  })
  .refine((h) => (h.breakStart === null) === (h.breakEnd === null), "Give the break both a start and an end, or leave both empty.");

const whole = (form: FormData, name: string, fallback: number) => {
  const t = text(form, name);
  return t === null ? fallback : Number(t);
};

/** Save how play works: sessions per pet, their length, the changeover, opening hours and any break. */
export async function savePlayHours(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can change play settings." };
  const parsed = Hours.safeParse({
    sessions: whole(form, "sessions", 0),
    minutes: whole(form, "minutes", 20),
    changeover: whole(form, "changeover", 0),
    dayStart: text(form, "dayStart") ?? "",
    dayEnd: text(form, "dayEnd") ?? "",
    breakStart: text(form, "breakStart"),
    breakEnd: text(form, "breakEnd"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const h = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .update({
      play_sessions_per_day: h.sessions,
      play_session_minutes: h.minutes,
      play_changeover_minutes: h.changeover,
      play_day_start: h.dayStart,
      play_day_end: h.dayEnd,
      play_break_start: h.breakStart,
      play_break_end: h.breakEnd,
    })
    .eq("id", org.id)
    .select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "Only an owner or manager can change play settings." };
  revalidatePath("/app", "layout");
  return { ok: "Play settings saved." };
}

export async function addYard(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can change yards." };
  const name = text(form, "name");
  if (!name || name.length > 40) return { error: "Name the yard, like Yard A. Up to 40 characters." };
  const supabase = await createClient();
  const { count } = await supabase.from("play_yards").select("id", { count: "exact", head: true }).eq("org_id", org.id);
  const { error } = await supabase.from("play_yards").insert({ org_id: org.id, name, sort_order: (count ?? 0) + 1 });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { ok: `Added ${name}.` };
}

export async function setYardActive(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const id = z.uuid().safeParse(form.get("yardId"));
  if (!id.success) return { error: "That yard could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("play_yards")
    .update({ is_active: form.get("active") === "true" })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "Only an owner or manager can change yards." };
  revalidatePath("/app", "layout");
  return {};
}
