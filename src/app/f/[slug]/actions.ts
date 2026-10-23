"use server";

import { formatMoney, normalizePhone, normalizePostalCode, parseKgToGrams, qrMatrix, qrSvgPath, upiLink } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { sendAlertsAfter } from "@/lib/push";
import { checked, text } from "@/lib/forms";
import { parentI18n } from "@/lib/i18n-server";
import { WEEKDAYS } from "@/lib/kitchen";
import { isRateLimited } from "@/lib/rate-limit-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

/** What the order page shows after sending: the payment to make, or that the area is not served yet. */
export interface FoodOrderState {
  error?: string;
  ok?: string;
  token?: string;
  status?: string;
  amount?: string;
  startsOn?: string;
  pay?: { link: string; d: string; size: number } | null;
  paid?: boolean;
}

/** The kennel's UPI details, as the page read them from get_public_food_form, for the pay link. */
export interface PayTo {
  vpa: string | null;
  payeeName: string;
  currency: string;
  locale: string;
  kennelName: string;
  country: string;
}

/**
 * Send an order from the public food order page. Runs with no signed-in
 * user: it can only call submit_food_order(), which checks everything again
 * and works the amount out itself. Bound by the page to the kennel's slug,
 * its language for parents and where to pay.
 */
export async function submitFoodOrder(slug: string, language: string, payTo: PayTo, _state: FoodOrderState, form: FormData): Promise<FoodOrderState> {
  const t = parentI18n(language);
  const e = t.m.foodOrder.errors;
  if (!isSupabaseConfigured()) return { error: t.m.intakeForm.errors.unavailable };
  if (await isRateLimited()) return { error: t.m.errors.slowDown };

  const kind = form.get("kind");
  if (kind !== "trial" && kind !== "subscription") return { error: e.kind };
  const name = text(form, "parent_name");
  if (!name) return { error: e.name };
  const phone = normalizePhone(text(form, "phone") ?? "");
  if (!phone) return { error: e.phone };
  const dog = text(form, "pet_name");
  if (!dog) return { error: e.dog };
  const weight = parseKgToGrams(text(form, "weight_kg") ?? "");
  if (weight === null || weight < 500) return { error: e.weight };
  const days = WEEKDAYS.filter((d) => form.get(`day_${d}`) === "on");
  if (kind === "subscription" && days.length === 0) return { error: e.days };
  const line = text(form, "line");
  if (!line) return { error: e.line };
  const postal = normalizePostalCode(text(form, "postal_code") ?? "", payTo.country);
  if (!postal) return { error: e.pin };
  if (!checked(form, "consent")) return { error: e.consent };

  const { data, error } = await createAnonClient().rpc("submit_food_order", {
    p_slug: slug,
    p_payload: {
      kind,
      parent_name: name,
      phone,
      pet_name: dog,
      weight_g: weight,
      plan: form.get("plan") === "topper" ? "topper" : "full",
      grams_per_day: Number(text(form, "grams_per_day") ?? "0"),
      weekdays: days,
      slot: text(form, "slot") ?? "morning",
      line,
      area: text(form, "area"),
      postal_code: postal,
      door_note: text(form, "door_note"),
      note: text(form, "note"),
      consent: true,
      consent_text: text(form, "consent_text"),
    },
  });
  if (error) return { error: friendlyError(error, t) };
  sendAlertsAfter();
  const r = data as { token: string; status: string; amount_minor: number | null; starts_on: string | null };
  const amount = r.amount_minor === null ? undefined : formatMoney(r.amount_minor, { currency: payTo.currency, locale: payTo.locale, trimZeros: true });
  let pay: FoodOrderState["pay"] = null;
  if (r.amount_minor !== null && r.amount_minor > 0 && payTo.vpa) {
    const link = upiLink({ vpa: payTo.vpa, payeeName: payTo.payeeName, amountMinor: r.amount_minor, note: `${payTo.kennelName} food` });
    pay = { link, ...qrSvgPath(qrMatrix(link)) };
  }
  return { ok: t.m.foodOrder.thanks, token: r.token, status: r.status, amount, startsOn: r.starts_on ?? undefined, pay };
}

/** "I have paid": the order is marked for staff to check (food_order_paid). */
export async function saidPaid(language: string, state: FoodOrderState, form: FormData): Promise<FoodOrderState> {
  const t = parentI18n(language);
  if (await isRateLimited()) return { ...state, error: t.m.errors.slowDown };
  const token = text(form, "token");
  if (!token || !/^[A-Za-z0-9_-]{64}$/.test(token)) return { ...state, error: t.m.errors.codes.WB181 };
  const { error } = await createAnonClient().rpc("food_order_paid", { p_token: token });
  if (error) return { ...state, error: friendlyError(error, t) };
  return { ...state, error: undefined, paid: true };
}
