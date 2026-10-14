"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isGstStateCode, isValidGstin, normalizePhone } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const Details = z.object({
  fullName: z.string().min(1, "Enter the parent's name.").max(120),
  email: z.email("That email address does not look right.").max(254).nullable(),
  address: z.string().max(500).nullable(),
  city: z.string().max(80).nullable(),
  postalCode: z.string().max(12).nullable(),
  emergencyName: z.string().max(120).nullable(),
  notes: z.string().max(2000, "Keep notes under 2,000 characters.").nullable(),
});

/** Change a parent's details. Phone numbers are checked and stored in one form so a returning parent is recognised. */
export async function updateClient(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const clientId = Id.safeParse(form.get("clientId"));
  if (!clientId.success) return { error: "That parent could not be found." };
  const national = org.country_code === "IN" ? "IN" : null;

  const phone = normalizePhone(text(form, "phone") ?? "", national);
  if (!phone) return { error: "Enter a valid mobile number." };
  const phones: Record<"alt_phone" | "emergency_phone", string | null> = { alt_phone: null, emergency_phone: null };
  for (const field of ["alt_phone", "emergency_phone"] as const) {
    const typed = text(form, field);
    if (typed === null) continue;
    const n = normalizePhone(typed, national);
    if (!n) return { error: field === "alt_phone" ? "The other number does not look right." : "The emergency number does not look right." };
    phones[field] = n;
  }
  const taxId = text(form, "tax_id")?.toUpperCase() ?? null;
  if (taxId && !isValidGstin(taxId)) return { error: "Enter a valid 15 character GSTIN, or leave it empty." };
  const gstState = text(form, "gst_state_code");
  if (gstState && !isGstStateCode(gstState)) return { error: "Choose the state from the list." };

  const parsed = Details.safeParse({
    fullName: text(form, "full_name") ?? "",
    email: text(form, "email"),
    address: text(form, "address"),
    city: text(form, "city"),
    postalCode: text(form, "postal_code"),
    emergencyName: text(form, "emergency_name"),
    notes: text(form, "notes"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const d = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("clients")
    .update({
      full_name: d.fullName,
      phone,
      ...phones,
      email: d.email,
      address: d.address,
      city: d.city,
      postal_code: d.postalCode,
      emergency_name: d.emergencyName,
      notes: d.notes,
      tax_id: taxId,
      gst_state_code: gstState ?? (taxId ? taxId.slice(0, 2) : null),
      ...(checked(form, "consent") ? { consent_at: new Date().toISOString(), consent_source: "staff" } : {}),
    })
    .eq("org_id", org.id)
    .eq("id", clientId.data)
    .is("deleted_at", null)
    .select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "That parent could not be found." };
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}

/**
 * Merge a duplicate into this parent: their pets, stays, bills and payments
 * move here and the duplicate disappears from lists. Owners and managers; the
 * database checks (merge_clients).
 */
export async function mergeClient(_state: FormState, form: FormData): Promise<FormState> {
  const { canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can merge parents." };
  const keep = Id.safeParse(form.get("keepId"));
  const merge = Id.safeParse(form.get("mergeId"));
  if (!keep.success || !merge.success) return { error: "That parent could not be found." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_clients", { p_keep: keep.data, p_merge: merge.data });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  redirect(`/app/clients/${keep.data}?done=merged`);
}
