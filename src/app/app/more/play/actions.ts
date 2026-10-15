"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { fill } from "@/lib/i18n";
import { getAppI18n, type I18n } from "@/lib/i18n-server";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const clock = /^([01]\d|2[0-3]):[0-5]\d$/;

/** A whole number from lo to hi, with one sentence for anything else. */
const between = (lo: number, hi: number, message: string) => z.number(message).int(message).min(lo, message).max(hi, message);

const hoursSchema = (y: I18n["m"]["yards"]) =>
  z
    .object({
      sessions: between(0, 12, y.sessionsRange),
      minutes: between(5, 240, y.minutesRange),
      changeover: between(0, 60, y.changeoverRange),
      dayStart: z.string().regex(clock, y.openLike),
      dayEnd: z.string().regex(clock, y.closeLike),
      breakStart: z.string().regex(clock, y.breakStartLike).nullable(),
      breakEnd: z.string().regex(clock, y.breakEndLike).nullable(),
    })
    .refine((h) => (h.breakStart === null) === (h.breakEnd === null), y.breakBoth);

const whole = (form: FormData, name: string, fallback: number) => {
  const t = text(form, name);
  return t === null ? fallback : Number(t);
};

/** Save how play works: sessions per pet, their length, the changeover, opening hours and any break. */
export async function savePlayHours(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.yards.onlyManagers };
  const parsed = hoursSchema(t.m.yards).safeParse({
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
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.yards.onlyManagers };
  revalidatePath("/app", "layout");
  return { ok: t.m.yards.saved };
}

export async function addYard(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.yards.onlyManagersYards };
  const name = text(form, "name");
  if (!name || name.length > 40) return { error: t.m.yards.nameYard };
  const supabase = await createClient();
  const { count } = await supabase.from("play_yards").select("id", { count: "exact", head: true }).eq("org_id", org.id);
  const { error } = await supabase.from("play_yards").insert({ org_id: org.id, name, sort_order: (count ?? 0) + 1 });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.yards.added, { name }) };
}

export async function setYardActive(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = z.uuid().safeParse(form.get("yardId"));
  if (!id.success) return { error: t.m.yards.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("play_yards")
    .update({ is_active: form.get("active") === "true" })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.yards.onlyManagersYards };
  revalidatePath("/app", "layout");
  return {};
}
