"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { gstinStateCode, isGstStateCode, isValidGstin, isValidInvoicePrefix, isValidVpa, normalizePhone, parseMoney } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { isLanguage } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** Set (or clear) the usual price for boarding or day boarding on the rate card. */
async function saveDefaultPrice(supabase: Supabase, orgId: string, kind: "boarding" | "daycare", priceMinor: number | null) {
  const existing = await supabase.from("services").select("id").eq("org_id", orgId).eq("kind", kind).eq("is_default", true).eq("is_active", true).maybeSingle();
  if (existing.error) return existing.error;
  if (priceMinor === null) return null; // An empty box leaves the current price alone.
  if (existing.data) {
    return (await supabase.from("services").update({ price_minor: priceMinor }).eq("org_id", orgId).eq("id", existing.data.id)).error;
  }
  return (
    await supabase.from("services").insert({
      org_id: orgId,
      kind,
      // Stored as data on the price list, in English like the rest of the starter data.
      name: kind === "boarding" ? "Boarding" : "Day boarding",
      unit: kind === "boarding" ? "night" : "day",
      price_minor: priceMinor,
      is_default: true,
    })
  ).error;
}

export async function saveSettings(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.settings.errors;
  if (!canManage) return { error: t.m.settings.onlyManagers };
  const national = org.country_code === "IN" ? "IN" : null;

  const name = text(form, "name");
  if (!name || name.length < 2 || name.length > 80) return { error: e.name };

  const phones: Record<"phone" | "whatsapp_phone", string | null> = { phone: null, whatsapp_phone: null };
  for (const field of ["phone", "whatsapp_phone"] as const) {
    const typed = text(form, field);
    if (typed === null) continue;
    const normalized = normalizePhone(typed, national);
    if (!normalized) return { error: field === "phone" ? e.phone : e.whatsapp };
    phones[field] = normalized;
  }

  const upi = text(form, "upi_vpa");
  if (upi !== null && !isValidVpa(upi)) return { error: e.upi };

  const prefix = (text(form, "invoice_prefix") ?? "WB").toUpperCase();
  if (!isValidInvoicePrefix(prefix)) return { error: e.prefix };

  const taxMode = form.get("tax_mode");
  if (taxMode !== "none" && taxMode !== "simple" && taxMode !== "gst_india") return { error: e.taxMode };
  const taxId = text(form, "tax_id")?.toUpperCase() ?? null;
  let gstState = text(form, "gst_state_code");
  if (taxMode === "gst_india") {
    if (!taxId || !isValidGstin(taxId)) return { error: e.gstin };
    gstState = gstState ?? gstinStateCode(taxId);
    if (!gstState || !isGstStateCode(gstState)) return { error: e.state };
    if (gstinStateCode(taxId) !== gstState) return { error: e.stateMismatch };
  }

  const rateText = text(form, "tax_rate_percent");
  const ratePercent = rateText === null ? 0 : Number(rateText);
  if (!Number.isFinite(ratePercent) || ratePercent < 0 || ratePercent > 100) return { error: e.rate };

  const prices: Record<"boarding" | "daycare", number | null> = { boarding: null, daycare: null };
  for (const kind of ["boarding", "daycare"] as const) {
    const typed = text(form, `price_${kind}`);
    if (typed === null) continue;
    const minor = parseMoney(typed);
    if (minor === null || minor < 0) return { error: e.prices };
    prices[kind] = minor;
  }

  const timeZone = text(form, "time_zone") ?? org.time_zone;
  const currency = (text(form, "currency") ?? org.currency).toUpperCase();
  const locale = text(form, "locale") ?? org.locale;
  const fiscalStart = Number(text(form, "fiscal_year_start_month") ?? org.fiscal_year_start_month);
  if (!/^[A-Z]{3}$/.test(currency)) return { error: e.currency };
  try {
    new Intl.NumberFormat(locale, { style: "currency", currency }).format(1);
  } catch {
    return { error: e.locale };
  }
  if (!Number.isInteger(fiscalStart) || fiscalStart < 1 || fiscalStart > 12) return { error: e.fiscalStart };

  // The language of the pages and messages parents see. The database checks it again.
  const parentLanguage = form.get("parent_language") ?? org.parent_language;
  if (!isLanguage(parentLanguage)) return { error: t.m.errors.codes.WB013 };

  const update: TablesUpdate<"organizations"> = {
    time_zone: timeZone,
    currency,
    locale,
    fiscal_year_start_month: fiscalStart,
    round_invoice_totals: checked(form, "round_invoice_totals"),
    name,
    legal_name: text(form, "legal_name"),
    ...phones,
    email: text(form, "email"),
    address_line1: text(form, "address_line1"),
    city: text(form, "city"),
    state: text(form, "state"),
    postal_code: text(form, "postal_code"),
    check_in_time: text(form, "check_in_time") ?? org.check_in_time,
    check_out_time: text(form, "check_out_time") ?? org.check_out_time,
    upi_vpa: upi,
    upi_payee_name: text(form, "upi_payee_name"),
    tax_mode: taxMode,
    tax_label: text(form, "tax_label"),
    tax_id: taxId,
    gst_state_code: gstState,
    default_tax_rate_bp: Math.round(ratePercent * 100),
    prices_include_tax: checked(form, "prices_include_tax"),
    invoice_prefix: prefix,
    intake_enabled: checked(form, "intake_enabled"),
    intake_notice: text(form, "intake_notice"),
    parent_language: parentLanguage,
  };

  const supabase = await createClient();
  const { data, error } = await supabase.from("organizations").update(update).eq("id", org.id).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.settings.onlyManagers };

  for (const kind of ["boarding", "daycare"] as const) {
    const priceError = await saveDefaultPrice(supabase, org.id, kind, prices[kind]);
    if (priceError) return { error: friendlyError(priceError, t) };
  }

  revalidatePath("/app", "layout");
  return { ok: t.m.settings.saved };
}
