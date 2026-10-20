"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isGstStateCode, isValidGstin, normalizePhone } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { setHidden } from "@/lib/hiding";
import { getAppI18n } from "@/lib/i18n-server";
import { BUCKET } from "@/lib/media";
import type { Messages } from "@/messages";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const details = (m: Messages) =>
  z.object({
    fullName: z.string().min(1, m.parent.errors.name).max(120),
    email: z.email(m.parent.errors.email).max(254).nullable(),
    address: z.string().max(500).nullable(),
    city: z.string().max(80).nullable(),
    postalCode: z.string().max(12).nullable(),
    emergencyName: z.string().max(120).nullable(),
    notes: z.string().max(2000, m.parent.errors.notesTooLong).nullable(),
  });

/** Change a parent's details. Phone numbers are checked and stored in one form so a returning parent is recognised. */
export async function updateClient(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const e = m.parent.errors;
  const clientId = Id.safeParse(form.get("clientId"));
  if (!clientId.success) return { error: m.errors.parentNotFound };
  const national = org.country_code === "IN" ? "IN" : null;

  const phone = normalizePhone(text(form, "phone") ?? "", national);
  if (!phone) return { error: e.phone };
  const phones: Record<"alt_phone" | "emergency_phone", string | null> = { alt_phone: null, emergency_phone: null };
  for (const field of ["alt_phone", "emergency_phone"] as const) {
    const typed = text(form, field);
    if (typed === null) continue;
    const n = normalizePhone(typed, national);
    if (!n) return { error: field === "alt_phone" ? e.altPhone : e.emergencyPhone };
    phones[field] = n;
  }
  const taxId = text(form, "tax_id")?.toUpperCase() ?? null;
  if (taxId && !isValidGstin(taxId)) return { error: e.gstin };
  const gstState = text(form, "gst_state_code");
  if (gstState && !isGstStateCode(gstState)) return { error: e.gstState };

  const parsed = details(m).safeParse({
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
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: m.errors.parentNotFound };
  revalidatePath("/app", "layout");
  return { ok: m.common.saved };
}

/**
 * Merge a duplicate into this parent: their pets, stays, bills and payments
 * move here and the duplicate disappears from lists. Owners and managers; the
 * database checks (merge_clients).
 */
export async function mergeClient(_state: FormState, form: FormData): Promise<FormState> {
  const { canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.parent.errors.onlyManagersMerge };
  const keep = Id.safeParse(form.get("keepId"));
  const merge = Id.safeParse(form.get("mergeId"));
  if (!keep.success || !merge.success) return { error: t.m.errors.parentNotFound };
  const supabase = await createClient();
  const { error } = await supabase.rpc("merge_clients", { p_keep: keep.data, p_merge: merge.data });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/clients/${keep.data}?done=merged`);
}

/** Hide a parent, with their pets, from lists, or show them again. Owners and managers; the database checks (guard_hiding). */
export async function setParentHidden(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.hiding.onlyManagers };
  const id = z.uuid().safeParse(form.get("clientId"));
  if (!id.success) return { error: t.m.errors.parentNotFound };
  const hide = form.get("hide") === "1";
  const supabase = await createClient();
  const error = await setHidden(supabase, t, org.id, "clients", id.data, hide);
  if (error) return { error };
  revalidatePath("/app", "layout");
  redirect(`/app/clients/${id.data}?done=${hide ? "hidden" : "shown"}`);
}

/**
 * Erase a parent's details on their request (erase_client). Owners only
 * (D29); the database refuses anyone else (WB074), and refuses while a pet is
 * in house or a stay is still to come. Then the files go from storage.
 */
export async function eraseClient(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.parent.privacy;
  if (!canDelete) return { error: t.m.errors.codes.WB074 };
  const clientId = Id.safeParse(form.get("clientId"));
  if (!clientId.success) return { error: t.m.errors.parentNotFound };
  if (!checked(form, "confirm")) return { error: w.confirmFirst };

  const supabase = await createClient();
  // The files this person can see now, before the rows that name them go.
  const before = await supabase.rpc("client_file_paths", { p_client: clientId.data });
  const { data, error } = await supabase.rpc("erase_client", { p_client: clientId.data });
  if (error) return { error: friendlyError(error, t) };

  const paths = [...new Set([...(before.data ?? []), ...(data ?? [])])].filter((p) => p.startsWith(`${org.id}/`));
  let filesLeft = false;
  for (let i = 0; i < paths.length; i += 100) {
    const removed = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (removed.error) filesLeft = true;
  }
  if (filesLeft) console.error("eraseClient: some files were not removed", clientId.data);
  revalidatePath("/app", "layout");
  redirect(`/app/dogs?done=${filesLeft ? "erased-files-left" : "erased"}`);
}
