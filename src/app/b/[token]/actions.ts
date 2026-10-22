"use server";

import { revalidatePath } from "next/cache";
import { isISODate, parseKgToGrams } from "@/lib/core";
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

/**
 * A known parent asks to pause their food, skip a delivery or have more on a
 * day, through their own link (M32). Kept for staff to confirm; the database
 * checks it is their own subscription and the dates (submit_food_request).
 */
export async function submitFoodRequest(token: string, language: string, _state: FormState, form: FormData): Promise<FormState> {
  const t = parentI18n(language);
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) return { error: t.m.requestForm.unavailable };
  if (await isRateLimited()) return { error: t.m.errors.slowDown };
  const kind = form.get("kind");
  if (kind !== "pause" && kind !== "skip" && kind !== "more") return { error: t.m.errors.codes.WB181 };
  const from = text(form, "from");
  const until = text(form, "until");
  if (!from || !isISODate(from) || (until !== null && !isISODate(until))) return { error: t.m.errors.codes.WB187 };
  const kg = text(form, "kg");
  const grams = kind === "more" ? parseKgToGrams(kg ?? "") : null;
  if (kind === "more" && grams === null) return { error: t.m.errors.codes.WB187 };
  const { error } = await createAnonClient().rpc("submit_food_request", {
    p_token: token,
    p_payload: { kind, subscription_id: text(form, "subscription_id"), from, until, grams, note: text(form, "note") },
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath(`/b/${token}`);
  return { ok: t.m.foodLink.sent };
}
