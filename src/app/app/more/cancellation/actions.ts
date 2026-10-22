"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { CANCEL_OUTCOMES } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Outcome = z.enum(CANCEL_OUTCOMES);

/**
 * Save the kennel's cancellation rules (M38): which days are the weekend, how
 * long credit lasts, and for boarding and for daycare the notice needed and
 * what happens to a weekday or weekend night with and without it. Owners and
 * managers; the database checks the ranges again.
 */
export async function saveCancellationRules(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.cancelSetup.errors;
  if (!canManage) return { error: t.m.cancelSetup.viewOnly };
  const weekend = form
    .getAll("weekend")
    .map(Number)
    .filter((d) => Number.isInteger(d) && d >= 1 && d <= 7);
  const months = Number(text(form, "creditMonths"));
  if (!Number.isInteger(months) || months < 1 || months > 60) return { error: e.months };

  const rules = [];
  for (const kind of ["boarding", "daycare"] as const) {
    const hours = Number(text(form, `${kind}.hours`));
    if (!Number.isInteger(hours) || hours < 0 || hours > 720) return { error: e.hours };
    const outcome = (field: string) => Outcome.catch("credit").parse(form.get(`${kind}.${field}`));
    rules.push({
      org_id: org.id,
      applies_to: kind,
      notice_hours: hours,
      weekday_on_time: outcome("weekdayOnTime"),
      weekday_late: outcome("weekdayLate"),
      weekend_on_time: outcome("weekendOnTime"),
      weekend_late: outcome("weekendLate"),
      updated_at: new Date().toISOString(),
    });
  }

  const supabase = await createClient();
  const saved = await supabase.from("organizations").update({ weekend_days: [...new Set(weekend)].sort(), credit_months: months }).eq("id", org.id).select("id");
  if (saved.error) return { error: friendlyError(saved.error, t) };
  if (saved.data.length === 0) return { error: t.m.cancelSetup.viewOnly };
  const { error } = await supabase.from("cancellation_rules").upsert(rules, { onConflict: "org_id,applies_to" });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.cancelSetup.saved };
}
