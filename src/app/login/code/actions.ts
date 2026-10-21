"use server";

import { redirect } from "next/navigation";
import { text, type FormState } from "@/lib/forms";
import { getVisitorI18n } from "@/lib/i18n-server";
import { isRateLimited } from "@/lib/rate-limit-server";
import { safeDestination } from "@/lib/safe-redirect";
import { siteOrigin } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * The second step of signing in: the 6-digit code from the person's
 * authenticator app. Supabase Auth checks it and upgrades the session to
 * assurance level aal2, which is what the database looks for
 * (session_meets_mfa). For people who are half signed in, so it does not use
 * requireUser(), which would send them straight back here.
 */
export async function verifyCode(_state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const { m } = await getVisitorI18n();
  const w = m.auth.code;
  if (await isRateLimited()) return { error: m.errors.slowDown };
  const code = (text(form, "code") ?? "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(code)) return { error: w.wrong };

  const supabase = await createClient();
  const { data: factors, error: listError } = await supabase.auth.mfa.listFactors();
  if (listError) redirect("/login");
  const factor = factors.totp.find((f) => f.status === "verified");
  if (!factor) redirect("/app");
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: factor.id, code });
  if (error) return { error: w.wrong };
  redirect(safeDestination(text(form, "next"), await siteOrigin(), "/app"));
}

/**
 * Sign in with a recovery code instead of the app, when the phone is lost
 * (D43). The code works once, for this session only; the database checks it
 * (use_recovery_code). Then the two-step page says what to do next.
 */
export async function signInWithRecoveryCode(_state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const { m } = await getVisitorI18n();
  const w = m.auth.code;
  if (await isRateLimited()) return { error: m.errors.slowDown };
  const code = (text(form, "recoveryCode") ?? "").toLowerCase().replace(/[^0-9a-f]/g, "");
  if (code.length !== 12) return { error: w.recoveryWrong };
  const supabase = await createClient();
  const { error } = await supabase.rpc("use_recovery_code", { p_code: code });
  if (error) return { error: w.recoveryWrong };
  redirect("/app/more/two-step?recovered=1");
}
