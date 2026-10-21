"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { BUCKET, readUpload, smallPath, store, type Upload } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import type { Messages } from "@/messages";

const Id = z.uuid();
const MAX_PHOTOS = 4;

/** The photos chosen in a PhotoInput, with their small copies when the browser made them. */
async function readPhotos(form: FormData, name: string, max: number, m: Messages): Promise<{ photos: { full: Upload; small: Upload | null }[] } | { error: string }> {
  const fulls = form.getAll(name).filter((v) => v instanceof File && v.size > 0);
  const smalls = form.getAll(`${name}_small`).filter((v) => v instanceof File && v.size > 0);
  if (fulls.length > max) return { error: fill(m.media.tooMany, { n: max }) };
  const photos: { full: Upload; small: Upload | null }[] = [];
  for (const [i, f] of fulls.entries()) {
    const full = await readUpload(f, m);
    if (full && "error" in full) return { error: full.error };
    if (!full) continue;
    const s = smalls[i] ? await readUpload(smalls[i], m) : null;
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
  const t = await getAppI18n();
  const { m } = t;
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: m.errors.bookingNotFound };
  const body = text(form, "body");
  if (!body) return { error: m.media.update.body };
  if (body.length > 2000) return { error: m.media.update.tooLong };

  const supabase = await createClient();
  const booking = await supabase.from("bookings").select("id, pet_id, status").eq("org_id", org.id).eq("id", bookingId.data).maybeSingle();
  if (booking.error || !booking.data) return { error: m.errors.bookingNotFound };

  const read = await readPhotos(form, "photos", MAX_PHOTOS, m);
  if ("error" in read) return { error: read.error };

  // Files first, under a new update id, then the update that names them.
  const updateId = crypto.randomUUID();
  const paths: string[] = [];
  for (const [i, p] of read.photos.entries()) {
    const path = `${org.id}/updates/${updateId}/${i + 1}.jpg`;
    const failed = await store(supabase, path, p.full);
    if (failed) return { error: m.media.update.photoFailed };
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
  if (error) return { error: friendlyError(error, t) };

  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${booking.data.id}/update?saved=${updateId}`);
}

/** Give a pet its photo, shown small on every row so staff know which dog is which. */
export async function setPetPhoto(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const petId = Id.safeParse(form.get("petId"));
  if (!petId.success) return { error: m.errors.petNotFound };
  const read = await readPhotos(form, "photo", 1, m);
  if ("error" in read) return { error: read.error };
  if (read.photos.length === 0) return { error: m.media.photo.choose };

  const supabase = await createClient();
  const pet = await supabase.from("pets").select("id").eq("org_id", org.id).eq("id", petId.data).maybeSingle();
  if (pet.error || !pet.data) return { error: m.errors.petNotFound };

  // A new name every time: staff add files, they never overwrite one.
  const path = `${org.id}/pets/${petId.data}/${crypto.randomUUID()}.jpg`;
  const failed = await store(supabase, path, read.photos[0].full);
  if (failed) return { error: m.media.photo.failed };
  if (read.photos[0].small) await store(supabase, smallPath(path), read.photos[0].small);

  const { error } = await supabase.from("pets").update({ photo_path: path }).eq("org_id", org.id).eq("id", petId.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: m.media.photo.saved };
}

const vaccination = (m: Messages) => {
  const e = m.media.vaccination.errors;
  return z
    .object({
      vaccine: z.string().min(1, e.vaccine).max(60, e.vaccineTooLong),
      givenOn: z.string().refine(isISODate, e.date).nullable(),
      validUntil: z.string().refine(isISODate, e.date).nullable(),
    })
    .refine((v) => !v.givenOn || !v.validUntil || v.validUntil >= v.givenOn, e.order);
};

/** Record a vaccination seen at the gate, with a photo or PDF of the certificate. */
export async function addVaccination(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const petId = Id.safeParse(form.get("petId"));
  if (!petId.success) return { error: m.errors.petNotFound };
  const parsed = vaccination(m).safeParse({ vaccine: text(form, "vaccine") ?? "", givenOn: text(form, "givenOn"), validUntil: text(form, "validUntil") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const certificate = await readUpload(form.get("certificate"), m, { allowPdf: true });
  if (certificate && "error" in certificate) return { error: certificate.error };

  const supabase = await createClient();
  const pet = await supabase.from("pets").select("id").eq("org_id", org.id).eq("id", petId.data).maybeSingle();
  if (pet.error || !pet.data) return { error: m.errors.petNotFound };

  const id = crypto.randomUUID();
  let path: string | null = null;
  if (certificate) {
    path = `${org.id}/vaccinations/${id}.${certificate.extension}`;
    const failed = await store(supabase, path, certificate);
    if (failed) return { error: m.media.vaccination.errors.certificateFailed };
    const small = form.get("certificate_small");
    const smallUpload = certificate.extension === "jpg" ? await readUpload(small, m) : null;
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
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(m.media.vaccination.recorded, { vaccine: parsed.data.vaccine }) };
}

/**
 * Take a photo posted by mistake off an update, and delete its file. Owners
 * only (D29; the database refuses anyone else, WB081, and Storage lets only
 * owners delete). The parent's stay page stops showing it at once, because it
 * shows only photos named on a visible update.
 */
export async function removeUpdatePhoto(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  if (!canDelete) return { error: m.errors.ownersDelete };
  const updateId = Id.safeParse(form.get("updateId"));
  const path = text(form, "path");
  if (!updateId.success || !path) return { error: m.media.update.photoNotFound };
  const supabase = await createClient();
  const update = await supabase.from("stay_updates").select("booking_id, media_paths").eq("org_id", org.id).eq("id", updateId.data).maybeSingle();
  if (update.error) return { error: friendlyError(update.error, t) };
  if (!update.data || !update.data.media_paths.includes(path)) return { error: m.media.update.photoNotFound };

  const { error } = await supabase
    .from("stay_updates")
    .update({ media_paths: update.data.media_paths.filter((p) => p !== path) })
    .eq("org_id", org.id)
    .eq("id", updateId.data);
  if (error) return { error: friendlyError(error, t) };
  // The update no longer names it, so nobody is shown it; a file left behind is only untidy.
  const removed = await supabase.storage.from(BUCKET).remove([path, smallPath(path)]);
  if (removed.error) console.error("removeUpdatePhoto: the file was not removed", updateId.data);
  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${update.data.booking_id}?done=photo_removed`);
}
