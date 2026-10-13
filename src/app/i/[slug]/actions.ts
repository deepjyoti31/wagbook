"use server";

import { isISODate, normalizePhone } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { IntakePayload } from "@/lib/intake";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

const MAX_PETS = 6;

/**
 * The public intake form. Runs with no signed-in user: it can only call
 * submit_intake(), which validates everything again inside the database.
 * Bound to the kennel's slug by the page.
 */
export async function submitIntake(slug: string, _state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) return { error: "This form is not available right now." };

  const phone = normalizePhone(text(form, "parent_phone") ?? "");
  if (!phone) return { error: "Enter a valid mobile number. Outside India, include the country code, like +14155552671." };

  const pets = [];
  for (let i = 0; i < MAX_PETS; i++) {
    const name = text(form, `pets.${i}.name`);
    if (name === null) continue;
    const neutered = form.get(`pets.${i}.is_neutered`);
    const vaccine = text(form, `pets.${i}.vaccine`);
    const validUntil = text(form, `pets.${i}.vaccine_valid_until`);
    pets.push({
      name,
      species: form.get(`pets.${i}.species`),
      breed: text(form, `pets.${i}.breed`),
      sex: form.get(`pets.${i}.sex`),
      is_neutered: neutered === "yes" ? true : neutered === "no" ? false : null,
      date_of_birth: text(form, `pets.${i}.date_of_birth`),
      weight_kg: text(form, `pets.${i}.weight_kg`),
      food_notes: text(form, `pets.${i}.food_notes`),
      medical_notes: text(form, `pets.${i}.medical_notes`),
      allergies: text(form, `pets.${i}.allergies`),
      behaviour_notes: text(form, `pets.${i}.behaviour_notes`),
      vet_name: text(form, `pets.${i}.vet_name`),
      vet_phone: text(form, `pets.${i}.vet_phone`),
      vaccinations: vaccine ? [{ vaccine, given_on: null, valid_until: validUntil && isISODate(validUntil) ? validUntil : null }] : [],
    });
  }

  const start = text(form, "start_date");
  const end = text(form, "end_date");
  const parsed = IntakePayload.safeParse({
    v: 1,
    parent: {
      name: text(form, "parent_name") ?? "",
      phone,
      email: text(form, "parent_email"),
      address: text(form, "parent_address"),
      city: text(form, "parent_city"),
      emergency_name: text(form, "emergency_name"),
      emergency_phone: text(form, "emergency_phone"),
    },
    pets,
    stay: {
      kind: form.get("kind"),
      start_date: start && isISODate(start) ? start : null,
      end_date: end && isISODate(end) ? end : null,
      notes: text(form, "stay_notes"),
    },
    consent: checked(form, "consent"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (parsed.data.stay.start_date && parsed.data.stay.end_date && parsed.data.stay.end_date < parsed.data.stay.start_date) {
    return { error: "Check-out is before check-in." };
  }

  const { error } = await createAnonClient().rpc("submit_intake", { p_slug: slug, p_payload: parsed.data });
  if (error) return { error: friendlyError(error) };
  return { ok: "sent" };
}
