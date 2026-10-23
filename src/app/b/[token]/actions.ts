"use server";

import { revalidatePath } from "next/cache";
import { isISODate, parseKgToGrams } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { parentI18n } from "@/lib/i18n-server";
import { BUCKET, readUpload } from "@/lib/media";
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * A known parent asks for an appointment at one of the free times, through
 * their own link (M59). It lands as a request for staff to confirm; the
 * database checks the pet, the service and that the time is free
 * (submit_booking_request).
 */
export async function submitAppointmentRequest(token: string, language: string, _state: FormState, form: FormData): Promise<FormState> {
  const t = parentI18n(language);
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) return { error: t.m.requestForm.unavailable };
  if (await isRateLimited()) return { error: t.m.errors.slowDown };
  const pet = text(form, "pet_id");
  const service = text(form, "service_id");
  const day = text(form, "date");
  const time = text(form, "time");
  if (!pet || !UUID.test(pet)) return { error: t.m.errors.codes.WB102 };
  if (!service || !UUID.test(service)) return { error: t.m.errors.codes.WB272 };
  if (!day || !isISODate(day) || !time || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) return { error: t.m.errors.codes.WB273 };
  const { error } = await createAnonClient().rpc("submit_booking_request", {
    p_token: token,
    p_payload: { appointment: { pet_id: pet, service_id: service, date: day, time, note: text(form, "note") } },
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath(`/b/${token}`);
  return { ok: t.m.appointmentLink.sent };
}

/**
 * A known parent tells the kennel a delivery went wrong, with a photo if they
 * have one (M59). The database writes it down where staff see problems and
 * gives back the one path the photo may go to; the photo goes there with the
 * link's secret (intake_upload_allowed). The problem is told either way.
 */
export async function reportDeliveryProblem(token: string, language: string, kennelName: string, _state: FormState, form: FormData): Promise<FormState> {
  const t = parentI18n(language);
  const w = t.m.problemLink;
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) return { error: t.m.requestForm.unavailable };
  if (await isRateLimited()) return { error: t.m.errors.slowDown };
  const delivery = text(form, "delivery_id");
  if (!delivery || !UUID.test(delivery)) return { error: w.chooseDelivery };
  const problem = form.get("problem");
  if (problem !== "damaged" && problem !== "late" && problem !== "wrong") return { error: w.chooseWhat };
  const photo = await readUpload(form.get("photo"), t.m);
  if (photo && "error" in photo) return { error: photo.error };
  const anon = createAnonClient({ linkToken: token });
  const { data, error } = await anon.rpc("submit_food_request", {
    p_token: token,
    p_payload: { kind: "problem", delivery_id: delivery, problem, note: text(form, "note")?.slice(0, 500) ?? null, photo: Boolean(photo) },
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath(`/b/${token}`);
  if (photo && typeof data === "string") {
    const { error: uploadError } = await anon.storage.from(BUCKET).upload(data, photo.bytes, { contentType: photo.contentType, upsert: false });
    if (uploadError) return { ok: fill(w.photoNotSent, { kennel: kennelName }) };
  }
  return { ok: w.sent };
}
