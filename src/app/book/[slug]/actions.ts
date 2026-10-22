"use server";

import { isISODate, normalizePhone, normalizePostalCode } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { parentI18n } from "@/lib/i18n-server";
import { IntakePayload } from "@/lib/intake";
import { isRateLimited } from "@/lib/rate-limit-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

const SERVICE = /^[0-9a-f-]{36}$/;

/**
 * The booking form for new parents (M41). Runs with no signed-in user and,
 * like the intake form, can only call submit_intake(): the form lands in
 * Intake forms with `request.make`, and accepting it there also makes the
 * stay or appointment as a request (accept_intake). Nothing is charged.
 * Bound by the page to the kennel's slug and its language for parents.
 */
export async function submitBookingForm(slug: string, language: string, _state: FormState, form: FormData): Promise<FormState> {
  const t = parentI18n(language);
  const e = t.m.bookingForm.errors;
  if (!isSupabaseConfigured()) return { error: t.m.intakeForm.errors.unavailable };
  if (await isRateLimited()) return { error: t.m.errors.slowDown };

  const phone = normalizePhone(text(form, "parent_phone") ?? "");
  if (!phone) return { error: t.m.intakeForm.errors.phone };
  const name = text(form, "parent_name");
  if (!name || name.length < 2) return { error: t.m.intakeForm.errors.name };
  const petName = text(form, "pet_name");
  if (!petName) return { error: t.m.intakeForm.errors.petName };

  const what = text(form, "what") ?? "";
  const appointment = SERVICE.test(what);
  if (!appointment && what !== "boarding" && what !== "daycare") return { error: e.what };
  const start = text(form, "start_date");
  if (!start || !isISODate(start)) return { error: e.date };
  const end = appointment ? null : text(form, "end_date");
  if (end !== null && (!isISODate(end) || end < start)) return { error: t.m.intakeForm.errors.datesOrder };
  const time = appointment ? text(form, "time") : null;
  if (appointment && !(time && /^([01]\d|2[0-3]):[0-5]\d$/.test(time))) return { error: e.time };

  const pickup = checked(form, "pickup");
  const pinTyped = text(form, "parent_postal_code");
  const postalCode = pinTyped === null ? null : (normalizePostalCode(pinTyped, "IN") ?? normalizePostalCode(pinTyped, ""));
  if (pinTyped !== null && postalCode === null) return { error: t.m.intakeForm.errors.pin };
  if (pickup && !text(form, "parent_address")) return { error: e.address };

  const neutered = form.get("is_neutered");
  const parsed = IntakePayload.safeParse({
    v: 1,
    parent: {
      name,
      phone,
      email: null,
      address: text(form, "parent_address"),
      area: text(form, "parent_area"),
      postal_code: postalCode,
      city: null,
      emergency_name: null,
      emergency_phone: null,
    },
    pets: [
      {
        name: petName,
        species: form.get("species"),
        breed: text(form, "breed"),
        sex: form.get("sex"),
        is_neutered: neutered === "yes" ? true : neutered === "no" ? false : null,
        date_of_birth: text(form, "date_of_birth"),
        vaccinations: [],
      },
    ],
    stay: { kind: what === "daycare" ? "daycare" : "boarding", start_date: start, end_date: end ?? start, notes: text(form, "notes") },
    request: {
      make: "true",
      service_id: appointment ? what : null,
      time,
      pickup: pickup ? "true" : "false",
      vaccinations_ok: checked(form, "vaccinations_ok") ? "true" : "false",
    },
    consent: checked(form, "consent"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].path[0] === "consent" ? t.m.intakeForm.errors.consent : t.m.errors.codes.WB041 };

  const { error } = await createAnonClient().rpc("submit_intake", { p_slug: slug, p_payload: parsed.data });
  if (error) return { error: friendlyError(error, t) };
  return { ok: "sent" };
}
