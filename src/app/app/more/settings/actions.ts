"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { gstinStateCode, isGstStateCode, isSacCode, isValidGstin, isValidInvoicePrefix, isValidVpa, normalizePhone, parseMoney, parseRatePercent } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { isLanguage } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * Set the usual price for boarding or day boarding on the rate card, the
 * shared kennel price for a second pet of the same parent in one kennel (an
 * empty box there means no shared price: the second pet pays the usual price),
 * and the kennel's own tax rate and service code for it (D35; an empty rate
 * means the usual rate).
 */
async function saveDefaultPrice(
  supabase: Supabase,
  orgId: string,
  kind: "boarding" | "daycare",
  priceMinor: number | null,
  sharedMinor: number | null,
  tax: { tax_rate_bp: number | null; sac_code: string | null },
  name: string,
) {
  const existing = await supabase.from("services").select("id").eq("org_id", orgId).eq("kind", kind).eq("is_default", true).eq("is_active", true).maybeSingle();
  if (existing.error) return existing.error;
  if (existing.data) {
    // An empty usual price leaves the current one alone.
    const change = priceMinor === null ? { shared_price_minor: sharedMinor, ...tax } : { price_minor: priceMinor, shared_price_minor: sharedMinor, ...tax };
    return (await supabase.from("services").update(change).eq("org_id", orgId).eq("id", existing.data.id)).error;
  }
  if (priceMinor === null) return null;
  return (
    await supabase.from("services").insert({
      org_id: orgId,
      kind,
      // Stored as data on the price list, in the language of whoever set the price.
      name,
      unit: kind === "boarding" ? "night" : "day",
      price_minor: priceMinor,
      shared_price_minor: sharedMinor,
      ...tax,
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
  const shared: Record<"boarding" | "daycare", number | null> = { boarding: null, daycare: null };
  for (const kind of ["boarding", "daycare"] as const) {
    for (const [box, into] of [[`price_${kind}`, prices], [`shared_price_${kind}`, shared]] as const) {
      const typed = text(form, box);
      if (typed === null) continue;
      const minor = parseMoney(typed);
      if (minor === null || minor < 0) return { error: e.prices };
      into[kind] = minor;
    }
  }

  // The kennel's own rate and code for each kind of stay. Wagbook does not choose them.
  const stayTax: Record<"boarding" | "daycare", { tax_rate_bp: number | null; sac_code: string | null }> = {
    boarding: { tax_rate_bp: null, sac_code: null },
    daycare: { tax_rate_bp: null, sac_code: null },
  };
  for (const kind of ["boarding", "daycare"] as const) {
    const rate = parseRatePercent(text(form, `tax_rate_${kind}`));
    if (rate === undefined) return { error: e.taxRate };
    const sac = text(form, `sac_${kind}`);
    if (sac !== null && !isSacCode(sac)) return { error: e.sac };
    stayTax[kind] = { tax_rate_bp: rate, sac_code: sac };
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
    const priceError = await saveDefaultPrice(supabase, org.id, kind, prices[kind], shared[kind], stayTax[kind], t.m.labels.bookingKind[kind]);
    if (priceError) return { error: friendlyError(priceError, t) };
  }

  revalidatePath("/app", "layout");
  return { ok: t.m.settings.saved };
}
