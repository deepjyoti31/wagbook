"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, parseMoney } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const isoDate = z.string().refine(isISODate, "Choose a valid date.");

const NewBooking = z
  .object({
    petId: z.uuid("Choose a pet."),
    kind: z.enum(["boarding", "daycare"]),
    startDate: isoDate,
    endDate: isoDate,
    kennelId: z.uuid().nullable(),
    notes: z.string().max(2000).nullable(),
  })
  .refine((b) => b.endDate >= b.startDate, "Check-out cannot be before check-in.")
  .refine((b) => b.kind !== "boarding" || b.endDate > b.startDate, "A boarding stay needs at least one night. For a day visit, choose day boarding.");

export async function createBooking(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const kind = form.get("kind") === "daycare" ? "daycare" : "boarding";
  const start = text(form, "startDate");
  const parsed = NewBooking.safeParse({
    petId: form.get("petId"),
    kind,
    startDate: start,
    // Day boarding for a single day needs only one date.
    endDate: text(form, "endDate") ?? (kind === "daycare" ? start : null),
    kennelId: text(form, "kennelId"),
    notes: text(form, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const b = parsed.data;

  const supabase = await createClient();

  // The pet decides the client. Reading it through our own session also proves it belongs to this organisation.
  const pet = await supabase.from("pets").select("id, client_id").eq("org_id", org.id).eq("id", b.petId).is("deleted_at", null).maybeSingle();
  if (pet.error) return { error: friendlyError(pet.error) };
  if (!pet.data) return { error: "That pet could not be found." };

  // Price: what was typed, otherwise the default from the rate card.
  const service = await supabase
    .from("services")
    .select("price_minor, tax_rate_bp, sac_code")
    .eq("org_id", org.id)
    .eq("kind", b.kind)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  if (service.error) return { error: friendlyError(service.error) };

  const typedRate = text(form, "rate");
  const rateMinor = typedRate === null ? (service.data?.price_minor ?? null) : parseMoney(typedRate);
  if (rateMinor === null || rateMinor < 0) {
    return {
      error: typedRate === null
        ? `Enter a price, or set your ${b.kind === "boarding" ? "boarding" : "day boarding"} price in Settings so it fills in by itself.`
        : "Enter the price as a number, like 1200 or 1200.50.",
    };
  }

  const { error } = await supabase.from("bookings").insert({
    org_id: org.id,
    client_id: pet.data.client_id,
    pet_id: b.petId,
    kind: b.kind,
    status: "confirmed",
    start_date: b.startDate,
    end_date: b.endDate,
    kennel_id: b.kennelId,
    rate_minor: rateMinor,
    tax_rate_bp: org.tax_mode === "none" ? 0 : (service.data?.tax_rate_bp ?? org.default_tax_rate_bp),
    sac_code: service.data?.sac_code ?? null,
    notes: b.notes,
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/app", "layout");
  redirect("/app/bookings");
}

export async function cancelBooking(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const id = z.uuid().safeParse(form.get("bookingId"));
  if (!id.success) return { error: "That booking could not be found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "cancelled", cancel_reason: text(form, "reason") })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .in("status", ["requested", "confirmed"])
    .select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "Only a booking that has not started can be cancelled." };

  revalidatePath("/app", "layout");
  return { ok: "Booking cancelled." };
}
