"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { readUpload, smallPath, store, type Upload } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const MAX_PHOTOS = 4;

/** The photos chosen in a PhotoInput, with their small copies when the browser made them. */
async function readPhotos(form: FormData, name: string, max: number): Promise<{ photos: { full: Upload; small: Upload | null }[] } | { error: string }> {
  const fulls = form.getAll(name).filter((v) => v instanceof File && v.size > 0);
  const smalls = form.getAll(`${name}_small`).filter((v) => v instanceof File && v.size > 0);
  if (fulls.length > max) return { error: `Choose at most ${max} photos.` };
  const photos: { full: Upload; small: Upload | null }[] = [];
  for (const [i, f] of fulls.entries()) {
    const full = await readUpload(f);
    if (full && "error" in full) return { error: full.error };
    if (!full) continue;
    const s = smalls[i] ? await readUpload(smalls[i]) : null;
    photos.push({ full, small: s && !("error" in s) ? s : null });
  }
  return { photos };
}

/**
 * Write an update for the parent (or a note for the next shift), with photos.
 * Then the page offers WhatsApp, with the message ready and the stay link that
 * shows the photos.
 */
export async function createUpdate(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: "That booking could not be found." };
  const body = text(form, "body");
  if (!body) return { error: "Write a line about how the pet is doing." };
  if (body.length > 2000) return { error: "Keep the update under 2,000 characters." };

  const supabase = await createClient();
  const booking = await supabase.from("bookings").select("id, pet_id, status").eq("org_id", org.id).eq("id", bookingId.data).maybeSingle();
  if (booking.error || !booking.data) return { error: "That booking could not be found." };

  const read = await readPhotos(form, "photos", MAX_PHOTOS);
  if ("error" in read) return { error: read.error };

  // Files first, under a new update id, then the update that names them.
  const updateId = crypto.randomUUID();
  const paths: string[] = [];
  for (const [i, p] of read.photos.entries()) {
    const path = `${org.id}/updates/${updateId}/${i + 1}.jpg`;
    const failed = await store(supabase, path, p.full);
    if (failed) return { error: "A photo could not be saved. Nothing was posted. Try again." };
    if (p.small) await store(supabase, smallPath(path), p.small);
    paths.push(path);
  }

  const { error } = await supabase.from("stay_updates").insert({
    id: updateId,
    org_id: org.id,
    booking_id: booking.data.id,
    pet_id: booking.data.pet_id,
    body,
    media_paths: paths,
    is_visible_to_parent: checked(form, "visible"),
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${booking.data.id}/update?saved=${updateId}`);
}

/** Give a pet its photo, shown small on every row so staff know which dog is which. */
export async function setPetPhoto(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const petId = Id.safeParse(form.get("petId"));
  if (!petId.success) return { error: "That pet could not be found." };
  const read = await readPhotos(form, "photo", 1);
  if ("error" in read) return { error: read.error };
  if (read.photos.length === 0) return { error: "Choose a photo first." };

  const supabase = await createClient();
  const pet = await supabase.from("pets").select("id").eq("org_id", org.id).eq("id", petId.data).maybeSingle();
  if (pet.error || !pet.data) return { error: "That pet could not be found." };

  // A new name every time: staff add files, they never overwrite one.
  const path = `${org.id}/pets/${petId.data}/${crypto.randomUUID()}.jpg`;
  const failed = await store(supabase, path, read.photos[0].full);
  if (failed) return { error: "The photo could not be saved. Try again." };
  if (read.photos[0].small) await store(supabase, smallPath(path), read.photos[0].small);

  const { error } = await supabase.from("pets").update({ photo_path: path }).eq("org_id", org.id).eq("id", petId.data);
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { ok: "Photo saved." };
}

const Vaccination = z
  .object({
    vaccine: z.string().min(1, "Say which vaccine, like rabies.").max(60, "Keep the vaccine name under 60 characters."),
    givenOn: z.string().refine(isISODate, "Choose a valid date.").nullable(),
    validUntil: z.string().refine(isISODate, "Choose a valid date.").nullable(),
  })
  .refine((v) => !v.givenOn || !v.validUntil || v.validUntil >= v.givenOn, "Valid until cannot be before the date it was given.");

/** Record a vaccination seen at the gate, with a photo or PDF of the certificate. */
export async function addVaccination(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const petId = Id.safeParse(form.get("petId"));
  if (!petId.success) return { error: "That pet could not be found." };
  const parsed = Vaccination.safeParse({ vaccine: text(form, "vaccine") ?? "", givenOn: text(form, "givenOn"), validUntil: text(form, "validUntil") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const certificate = await readUpload(form.get("certificate"), { allowPdf: true });
  if (certificate && "error" in certificate) return { error: certificate.error };

  const supabase = await createClient();
  const pet = await supabase.from("pets").select("id").eq("org_id", org.id).eq("id", petId.data).maybeSingle();
  if (pet.error || !pet.data) return { error: "That pet could not be found." };

  const id = crypto.randomUUID();
  let path: string | null = null;
  if (certificate) {
    path = `${org.id}/vaccinations/${id}.${certificate.extension}`;
    const failed = await store(supabase, path, certificate);
    if (failed) return { error: "The certificate could not be saved. Try again." };
    const small = form.get("certificate_small");
    const smallUpload = certificate.extension === "jpg" ? await readUpload(small) : null;
    if (smallUpload && !("error" in smallUpload)) await store(supabase, smallPath(path), smallUpload);
  }

  const { error } = await supabase.from("vaccinations").insert({
    id,
    org_id: org.id,
    pet_id: petId.data,
    vaccine: parsed.data.vaccine.toLowerCase(),
    given_on: parsed.data.givenOn,
    valid_until: parsed.data.validUntil,
    certificate_path: path,
    // Recording it from the certificate in hand is checking it; the database stamps who and when.
    verified_at: path ? new Date().toISOString() : null,
  });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { ok: `Recorded ${parsed.data.vaccine}.` };
}
