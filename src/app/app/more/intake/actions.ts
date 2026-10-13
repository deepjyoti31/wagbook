"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { IntakePayload } from "@/lib/intake";
import { createClient } from "@/lib/supabase/server";

/**
 * Accept a parent's form: the database turns it into a client and pets
 * (reusing the client if the phone number is already known). Then go straight
 * to a new booking for the first pet, with the requested dates filled in.
 */
export async function acceptSubmission(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const id = z.uuid().safeParse(form.get("submissionId"));
  if (!id.success) return { error: "That form could not be found." };

  const supabase = await createClient();
  const sub = await supabase
    .from("intake_submissions")
    .select("id, status, payload, requested_start, requested_end")
    .eq("org_id", org.id)
    .eq("id", id.data)
    .maybeSingle();
  if (sub.error) return { error: friendlyError(sub.error) };
  if (!sub.data) return { error: "That form could not be found." };
  if (sub.data.status !== "new") return { error: "Someone has already dealt with this form." };
  // The database checks this again. Checking here gives a clearer sentence.
  if (!IntakePayload.safeParse(sub.data.payload).success) {
    return { error: "This form could not be read fully, so it cannot be accepted as it is. Call the parent, add them by hand, then decline the form." };
  }

  const accepted = await supabase.rpc("accept_intake", { p_submission: id.data });
  if (accepted.error) return { error: friendlyError(accepted.error) };

  const pet = await supabase
    .from("pets")
    .select("id")
    .eq("org_id", org.id)
    .eq("client_id", accepted.data)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  revalidatePath("/app", "layout");
  const params = new URLSearchParams();
  if (pet.data) params.set("pet", pet.data.id);
  if (sub.data.requested_start) params.set("start", sub.data.requested_start);
  if (sub.data.requested_end) params.set("end", sub.data.requested_end);
  redirect(`/app/bookings/new?${params.toString()}`);
}

export async function rejectSubmission(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const id = z.uuid().safeParse(form.get("submissionId"));
  if (!id.success) return { error: "That form could not be found." };

  const supabase = await createClient();
  const { error } = await supabase
    .from("intake_submissions")
    .update({ status: form.get("spam") === "true" ? "spam" : "rejected" })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .eq("status", "new");
  if (error) return { error: friendlyError(error) };

  revalidatePath("/app", "layout");
  return {};
}
