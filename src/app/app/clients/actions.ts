"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { addDays, formatDate, isGstStateCode, isISODate, isValidGstin, normalizePhone, todayIn } from "@/lib/core";
import { billFromLines, draftPayload } from "@/lib/billing";
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
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const e = m.parent.errors;
  const clientId = Id.safeParse(form.get("clientId"));
  if (!clientId.success) return { error: m.errors.parentNotFound };
  const national = org.country_code === "IN" ? "IN" : null;

  // Only owners and managers change the parent's own numbers (the database refuses staff, WB002); staff are not shown the boxes.
  const phone = canManage ? normalizePhone(text(form, "phone") ?? "", national) : null;
  if (canManage && !phone) return { error: e.phone };
  const phones: Partial<Record<"alt_phone" | "emergency_phone", string | null>> = canManage ? { alt_phone: null, emergency_phone: null } : { emergency_phone: null };
  for (const field of canManage ? (["alt_phone", "emergency_phone"] as const) : (["emergency_phone"] as const)) {
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
      ...(phone ? { phone } : {}),
      ...phones,
      email: d.email,
      address: d.address,
      city: d.city,
      postal_code: d.postalCode,
      emergency_name: d.emergencyName,
      notes: d.notes,
      tax_id: taxId,
      // Bills are in English; a parent who asks gets their language too, in brackets.
      bill_translation: form.get("bill_translation") === "hi" || form.get("bill_translation") === "kn" ? (form.get("bill_translation") as "hi" | "kn") : null,
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

/** A new booking link for a parent (D36); the old one stops working. Any member; the database makes the secret. */
export async function renewRequestLink(_state: FormState, form: FormData): Promise<FormState> {
  await requireOrg();
  const t = await getAppI18n();
  const clientId = Id.safeParse(form.get("clientId"));
  if (!clientId.success) return { error: t.m.errors.parentNotFound };
  const supabase = await createClient();
  const { error } = await supabase.rpc("renew_request_link", { p_client: clientId.data });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.parent.requestLink.renewed };
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
 * in house or a stay is still to come. Then the files go from storage. The
 * pets' own records stay (D30).
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
  // erase_client returns the files that go: updates' photos, forms' files and certificates. The pets' photos stay (D30).
  const { data, error } = await supabase.rpc("erase_client", { p_client: clientId.data });
  if (error) return { error: friendlyError(error, t) };

  const paths = [...new Set(data ?? [])].filter((p) => p.startsWith(`${org.id}/`));
  let filesLeft = false;
  for (let i = 0; i < paths.length; i += 100) {
    const removed = await supabase.storage.from(BUCKET).remove(paths.slice(i, i + 100));
    if (removed.error) filesLeft = true;
  }
  if (filesLeft) console.error("eraseClient: some files were not removed", clientId.data);
  revalidatePath("/app", "layout");
  redirect(`/app/dogs?done=${filesLeft ? "erased-files-left" : "erased"}`);
}

/**
 * Sell a parent a day boarding pack (D37): the pack, and a draft bill for it
 * to issue. Owners and managers (the database's policy on passes says so too).
 * The bill line is stored in English like every bill line (D31).
 */
export async function sellPack(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.parent.packs;
  if (!canManage) return { error: t.m.errors.codes.WB002 };
  const clientId = Id.safeParse(form.get("clientId"));
  const packId = Id.safeParse(form.get("packId"));
  if (!clientId.success) return { error: t.m.errors.parentNotFound };
  if (!packId.success) return { error: w.choose };
  const startsOn = text(form, "starts_on") ?? todayIn(org.time_zone);
  if (!isISODate(startsOn)) return { error: t.m.booking.errors.validDate };

  const supabase = await createClient();
  const pack = await supabase.from("day_packs").select("id, name, days, price_minor, valid_days, tax_rate_bp, sac_code").eq("org_id", org.id).eq("id", packId.data).eq("is_active", true).maybeSingle();
  if (pack.error) return { error: friendlyError(pack.error, t) };
  if (!pack.data) return { error: w.choose };
  const p = pack.data;
  const validUntil = addDays(startsOn, p.valid_days - 1);

  const totals = billFromLines(org, [
    {
      description: `${p.name}: ${p.days} days of day boarding, ${formatDate(startsOn)} to ${formatDate(validUntil)}`.slice(0, 300),
      quantity: 1,
      unitPriceMinor: p.price_minor,
      taxRateBp: org.tax_mode === "none" ? 0 : (p.tax_rate_bp ?? org.default_tax_rate_bp),
      sacCode: p.sac_code,
    },
  ]);
  const bill = await supabase.from("invoices").insert({ org_id: org.id, client_id: clientId.data }).select("id").single();
  if (bill.error) return { error: friendlyError(bill.error, t) };
  const saved = await supabase.rpc("save_invoice_draft", { p_invoice: bill.data.id, ...draftPayload(totals) });
  if (saved.error) return { error: friendlyError(saved.error, t) };
  const pass = await supabase.from("passes").insert({
    org_id: org.id,
    client_id: clientId.data,
    day_pack_id: p.id,
    name: p.name,
    days: p.days,
    price_minor: p.price_minor,
    starts_on: startsOn,
    valid_until: validUntil,
    invoice_id: bill.data.id,
  });
  if (pass.error) return { error: friendlyError(pass.error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/bills/${bill.data.id}`);
}
