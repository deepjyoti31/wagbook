"use server";

import type { z } from "zod";
import { isISODate, normalizePhone } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { parentI18n, type I18n } from "@/lib/i18n-server";
import { IntakePayload } from "@/lib/intake";
import { BUCKET, readUpload, type Upload } from "@/lib/media";
import { isRateLimited } from "@/lib/rate-limit-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

const MAX_PETS = 6;
/** Pets are numbered by a key that grows each time one is added on the page (intake-form.tsx). */
const MAX_PET_KEYS = 60;

/** The sentence for the first thing wrong with the form, in the parent's language. */
function issueText(issue: z.core.$ZodIssue, m: I18n["m"]): string {
  const e = m.intakeForm.errors;
  const [first, , field] = issue.path;
  if (first === "parent" && issue.path[1] === "name") return e.name;
  if (first === "parent" && issue.path[1] === "phone") return e.phone;
  if (first === "pets" && issue.path.length === 1) return issue.code === "too_big" ? e.atMostSixPets : e.atLeastOnePet;
  if (first === "pets" && field === "name") return e.petName;
  if (first === "consent") return e.consent;
  return m.errors.codes.WB041;
}

/**
 * The public intake form. Runs with no signed-in user: it can only call
 * submit_intake(), which validates everything again inside the database.
 * Bound by the page to the kennel's slug and its language for parents (which
 * only decides the language of the sentences sent back).
 */
export async function submitIntake(slug: string, kennelName: string, language: string, _state: FormState, form: FormData): Promise<FormState> {
  const t = parentI18n(language);
  const e = t.m.intakeForm.errors;
  if (!isSupabaseConfigured()) return { error: e.unavailable };
  if (await isRateLimited()) return { error: t.m.errors.slowDown };

  const phone = normalizePhone(text(form, "parent_phone") ?? "");
  if (!phone) return { error: e.phone };

  const pets = [];
  // The certificates sent for each pet (one for each of its two vaccines), in the same order as `pets`.
  const certificates: (Upload | null)[][] = [];
  for (let i = 0; i < MAX_PET_KEYS && pets.length <= MAX_PETS; i++) {
    const name = text(form, `pets.${i}.name`);
    if (name === null) continue;
    const neutered = form.get(`pets.${i}.is_neutered`);
    const vaccine = text(form, `pets.${i}.vaccine`);
    const validUntil = text(form, `pets.${i}.vaccine_valid_until`);
    const vaccine2 = text(form, `pets.${i}.vaccine2`);
    const validUntil2 = text(form, `pets.${i}.vaccine2_valid_until`);
    const vaccinations = [
      ...(vaccine ? [{ vaccine, given_on: null, valid_until: validUntil && isISODate(validUntil) ? validUntil : null }] : []),
      ...(vaccine2 ? [{ vaccine: vaccine2, given_on: null, valid_until: validUntil2 && isISODate(validUntil2) ? validUntil2 : null }] : []),
    ];
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
      vaccinations,
    });
    // The first card belongs to the first vaccine written; the second card to the second.
    const cards: (Upload | null)[] = [];
    for (const [field, forVaccine] of [["certificate", vaccine ?? vaccine2], ["certificate2", vaccine && vaccine2]] as const) {
      const card = await readUpload(form.get(`pets.${i}.${field}`), t.m, { allowPdf: true });
      if (card && "error" in card) return { error: card.error };
      if (card && !forVaccine) return { error: e.certificateNeedsVaccine };
      cards.push(card);
    }
    certificates.push(cards);
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
  if (!parsed.success) return { error: issueText(parsed.error.issues[0], t.m) };
  if (parsed.data.stay.start_date && parsed.data.stay.end_date && parsed.data.stay.end_date < parsed.data.stay.start_date) {
    return { error: e.datesOrder };
  }

  const { data, error } = await createAnonClient().rpc("submit_intake", { p_slug: slug, p_payload: parsed.data });
  if (error) return { error: friendlyError(error, t) };

  // Certificates go after the form, into its own folder, with the secret it
  // gave back (intake_upload_allowed). The form is in either way.
  const sent = data as { folder: string; upload_token: string } | null;
  let allSent = true;
  if (certificates.flat().some(Boolean)) {
    const anon = createAnonClient({ intakeToken: sent?.upload_token });
    for (const [i, cards] of certificates.entries()) {
      for (const [j, c] of cards.entries()) {
        if (!c) continue;
        // pet-N for the first vaccine, pet-N-2 for the second (intake_upload_allowed).
        const name = `${sent?.folder}/pet-${i + 1}${j === 1 ? "-2" : ""}`;
        const { error: uploadError } = sent ? await anon.storage.from(BUCKET).upload(name, c.bytes, { contentType: c.contentType, upsert: false }) : { error: true };
        if (uploadError) allSent = false;
      }
    }
  }
  return { ok: allSent ? "sent" : fill(t.m.intakeForm.certificateNotSent, { kennel: kennelName }) };
}
