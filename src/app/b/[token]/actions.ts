"use server";

import { revalidatePath } from "next/cache";
import { isISODate } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { parentI18n } from "@/lib/i18n-server";
import { isRateLimited } from "@/lib/rate-limit-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

/**
 * A known parent asks for a stay through their own booking link. Runs with no
 * signed-in user: it can only call submit_booking_request(), which checks
 * everything again inside the database. Bound by the page to the link's token
 * and the kennel's language for parents.
 */
export async function submitBookingRequest(token: string, language: string, _state: FormState, form: FormData): Promise<FormState> {
  const t = parentI18n(language);
  const w = t.m.requestForm;
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) return { error: w.unavailable };
  if (await isRateLimited()) return { error: t.m.errors.slowDown };

  const petIds = form.getAll("pet_id").filter((v): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v));
  if (petIds.length === 0) return { error: t.m.errors.codes.WB102 };
  const kind = form.get("kind") === "daycare" ? "daycare" : "boarding";
  const start = text(form, "start_date");
  const end = text(form, "end_date");
  if (!start || !isISODate(start) || (end !== null && !isISODate(end))) return { error: t.m.errors.codes.WB103 };

  const { error } = await createAnonClient().rpc("submit_booking_request", {
    p_token: token,
    p_payload: { kind, start_date: start, end_date: end ?? (kind === "daycare" ? start : null), pet_ids: [...new Set(petIds)], note: text(form, "note") },
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath(`/b/${token}`);
  return { ok: w.sent };
}
