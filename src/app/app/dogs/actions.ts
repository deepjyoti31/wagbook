"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, normalizePhone } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import type { Messages } from "@/messages";
import { INCIDENT_CATEGORIES, PET_FLAGS } from "@/lib/pets";
import { createClient } from "@/lib/supabase/server";

const newPet = (m: Messages) =>
  z.object({
    parentName: z.string().min(1, m.newPet.errors.parentName).max(120),
    petName: z.string().min(1, m.pet.errors.petName).max(80),
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
  const t = await getAppI18n();
  const { m } = t;

  const phone = normalizePhone(text(form, "parentPhone") ?? "", org.country_code === "IN" ? "IN" : null);
  if (!phone) {
    return { error: org.country_code === "IN" ? m.newPet.errors.phoneIndia : m.newPet.errors.phoneElsewhere };
  }
  const weightText = text(form, "weightKg");
  const parsed = newPet(m).safeParse({
    parentName: text(form, "parentName") ?? "",
    petName: text(form, "petName") ?? "",
    species: form.get("species"),
    sex: form.get("sex"),
    weightKg: weightText === null ? null : Number(weightText),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].path[0] === "weightKg" ? m.pet.errors.weight : parsed.error.issues[0].message };
  const p = parsed.data;

  const supabase = await createClient();

  let clientId: string;
  const existing = await supabase.from("clients").select("id").eq("org_id", org.id).eq("phone", phone).is("deleted_at", null).maybeSingle();
  if (existing.error) return { error: friendlyError(existing.error, t) };
  if (existing.data) {
    clientId = existing.data.id;
  } else {
    const created = await supabase
      .from("clients")
      .insert({ org_id: org.id, full_name: p.parentName, phone, consent_at: checked(form, "consent") ? new Date().toISOString() : null, consent_source: checked(form, "consent") ? "staff" : null })
      .select("id")
      .single();
    if (created.error) return { error: friendlyError(created.error, t) };
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
  if (error) return { error: friendlyError(error, t) };

  revalidatePath("/app", "layout");
  redirect("/app/dogs");
}

const Id = z.uuid();

const petDetails = (m: Messages) => {
  const long = z.string().max(2000, m.pet.errors.notesTooLong).nullable();
  return z.object({
    name: z.string().min(1, m.pet.errors.petName).max(80),
    species: z.enum(["dog", "cat", "other"]),
    sex: z.enum(["male", "female", "unknown"]),
    breed: z.string().max(80).nullable(),
    color: z.string().max(80).nullable(),
    microchip: z.string().max(40).nullable(),
    dateOfBirth: z.string().refine(isISODate, m.pet.errors.dateOfBirth).nullable(),
    weightKg: z.number().positive().lt(200).nullable(),
    foodNotes: long,
    medicalNotes: long,
    allergies: long,
    behaviourNotes: long,
    vetName: z.string().max(120).nullable(),
    vetPhone: z.string().max(40).nullable(),
  });
};

/** Change anything about a pet. Any member: details change at the gate, not only in the office. */
export async function updatePet(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const petId = Id.safeParse(form.get("petId"));
  if (!petId.success) return { error: m.errors.petNotFound };
  const weight = text(form, "weightKg");
  const parsed = petDetails(m).safeParse({
    name: text(form, "name") ?? "",
    species: form.get("species"),
    sex: form.get("sex"),
    breed: text(form, "breed"),
    color: text(form, "color"),
    microchip: text(form, "microchip"),
    dateOfBirth: text(form, "dateOfBirth"),
    weightKg: weight === null ? null : Number(weight),
    foodNotes: text(form, "foodNotes"),
    medicalNotes: text(form, "medicalNotes"),
    allergies: text(form, "allergies"),
    behaviourNotes: text(form, "behaviourNotes"),
    vetName: text(form, "vetName"),
    vetPhone: text(form, "vetPhone"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].path[0] === "weightKg" ? m.pet.errors.weight : parsed.error.issues[0].message };
  const p = parsed.data;
  const neutered = form.get("isNeutered");

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pets")
    .update({
      name: p.name,
      species: p.species,
      sex: p.sex,
      breed: p.breed,
      color: p.color,
      microchip: p.microchip,
      date_of_birth: p.dateOfBirth,
      weight_kg: p.weightKg,
      is_neutered: neutered === "yes" ? true : neutered === "no" ? false : null,
      food_notes: p.foodNotes,
      medical_notes: p.medicalNotes,
      allergies: p.allergies,
      behaviour_notes: p.behaviourNotes,
      vet_name: p.vetName,
      vet_phone: p.vetPhone,
      flags: PET_FLAGS.filter((f) => checked(form, `flag_${f}`)),
    })
    .eq("org_id", org.id)
    .eq("id", petId.data)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: m.errors.petNotFound };
  revalidatePath("/app", "layout");
  return { ok: m.common.saved };
}

const incident = (m: Messages) =>
  z.object({
    category: z.enum(INCIDENT_CATEGORIES, m.incident.errors.category),
    severity: z.enum(["low", "medium", "high"], m.incident.errors.severity),
    description: z.string().min(1, m.incident.errors.description).max(4000, m.incident.errors.tooLong),
    actionTaken: z.string().max(4000).nullable(),
  });

/** Write down something out of the ordinary, while it is fresh. */
export async function addIncident(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const petId = Id.safeParse(form.get("petId"));
  if (!petId.success) return { error: t.m.errors.petNotFound };
  const parsed = incident(t.m).safeParse({
    category: form.get("category"),
    severity: form.get("severity"),
    description: text(form, "description") ?? "",
    actionTaken: text(form, "actionTaken"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const i = parsed.data;

  const supabase = await createClient();
  // The stay it happened in: the pet's current one, if it is in house.
  const stay = await supabase.from("bookings").select("id").eq("org_id", org.id).eq("pet_id", petId.data).eq("status", "checked_in").order("start_date", { ascending: false }).limit(1).maybeSingle();
  const { error } = await supabase.from("incidents").insert({
    org_id: org.id,
    pet_id: petId.data,
    booking_id: stay.data?.id ?? null,
    category: i.category,
    severity: i.severity,
    description: i.description,
    action_taken: i.actionTaken,
    vet_visited: checked(form, "vetVisited"),
    // The database stamps the real time and who; any value marks it.
    parent_notified_at: checked(form, "parentTold") ? new Date().toISOString() : null,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/dogs/${petId.data}?done=incident`);
}

/** Mark that the parent was told, or that the incident is over. */
export async function updateIncident(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const notFound = t.m.incident.errors.notFound;
  const id = Id.safeParse(form.get("incidentId"));
  if (!id.success) return { error: notFound };
  const what = form.get("what");
  const change = what === "told" ? { parent_notified_at: new Date().toISOString() } : what === "resolved" ? { resolved_at: new Date().toISOString() } : null;
  if (!change) return { error: notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("incidents").update(change).eq("org_id", org.id).eq("id", id.data).select("id, pet_id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: notFound };
  revalidatePath("/app", "layout");
  // The button that was pressed goes away, and its message with it: say so on the page.
  redirect(`/app/dogs/${data[0].pet_id}?done=${what}`);
}
