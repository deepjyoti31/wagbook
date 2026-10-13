"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { normalizePhone } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { PET_FLAGS } from "@/lib/pets";
import { createClient } from "@/lib/supabase/server";

const NewPet = z.object({
  parentName: z.string().min(1, "Enter the parent's name.").max(120),
  petName: z.string().min(1, "Enter the pet's name.").max(80),
  species: z.enum(["dog", "cat", "other"]),
  sex: z.enum(["male", "female", "unknown"]),
  weightKg: z.number().positive().lt(200).nullable(),
});

/**
 * Add a pet. The parent is found by phone number if the kennel already knows
 * them, otherwise created. This is the walk-in path; the intake form is the
 * other way pets arrive.
 */
export async function createPet(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();

  const phone = normalizePhone(text(form, "parentPhone") ?? "", org.country_code === "IN" ? "IN" : null);
  if (!phone) {
    return { error: org.country_code === "IN" ? "Enter a valid 10 digit mobile number." : "Enter the phone number with its country code, like +14155552671." };
  }
  const weightText = text(form, "weightKg");
  const parsed = NewPet.safeParse({
    parentName: text(form, "parentName") ?? "",
    petName: text(form, "petName") ?? "",
    species: form.get("species"),
    sex: form.get("sex"),
    weightKg: weightText === null ? null : Number(weightText),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].path[0] === "weightKg" ? "Enter the weight in kilograms, like 34.5." : parsed.error.issues[0].message };
  const p = parsed.data;

  const supabase = await createClient();

  let clientId: string;
  const existing = await supabase.from("clients").select("id").eq("org_id", org.id).eq("phone", phone).is("deleted_at", null).maybeSingle();
  if (existing.error) return { error: friendlyError(existing.error) };
  if (existing.data) {
    clientId = existing.data.id;
  } else {
    const created = await supabase
      .from("clients")
      .insert({ org_id: org.id, full_name: p.parentName, phone, consent_at: checked(form, "consent") ? new Date().toISOString() : null, consent_source: checked(form, "consent") ? "staff" : null })
      .select("id")
      .single();
    if (created.error) return { error: friendlyError(created.error) };
    clientId = created.data.id;
  }

  const neutered = form.get("isNeutered");
  const { error } = await supabase.from("pets").insert({
    org_id: org.id,
    client_id: clientId,
    name: p.petName,
    species: p.species,
    sex: p.sex,
    breed: text(form, "breed"),
    is_neutered: neutered === "yes" ? true : neutered === "no" ? false : null,
    weight_kg: p.weightKg,
    food_notes: text(form, "foodNotes"),
    medical_notes: text(form, "medicalNotes"),
    allergies: text(form, "allergies"),
    behaviour_notes: text(form, "behaviourNotes"),
    flags: PET_FLAGS.filter((f) => checked(form, `flag_${f}`)),
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/app", "layout");
  redirect("/app/dogs");
}
