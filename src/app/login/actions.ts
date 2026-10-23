"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { text, type FormState } from "@/lib/forms";
import { isLanguage } from "@/lib/i18n";
import { isRateLimited } from "@/lib/rate-limit-server";
import { getVisitorI18n, rememberLanguage, type I18n } from "@/lib/i18n-server";
import { safeDestination } from "@/lib/safe-redirect";
import { madeByResetLink } from "@/lib/core";
import { siteOrigin } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/** An email and password, with each refusal in the reader's language. */
function credentials(m: I18n["m"]) {
  const e = m.auth.errors;
  return z.object({
    email: z.string().trim().toLowerCase().pipe(z.email(e.email)),
    password: z.string().min(8, e.passwordShort).max(72, e.passwordLong),
  });
}

/** True when the request never got an answer, as opposed to being refused. */
function isUnreachable(error: { name: string; status?: number }): boolean {
  return error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status ?? 0) >= 500;
}

function parse(form: FormData, m: I18n["m"]) {
  return credentials(m).safeParse({ email: form.get("email"), password: form.get("password") });
}

export async function signIn(_state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const { m } = await getVisitorI18n();
  const e = m.auth.errors;
  if (await isRateLimited()) return { error: m.errors.slowDown };
  const parsed = parse(form, m);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (isUnreachable(error)) return { error: e.unreachable };
    // Deliberately the same message for a wrong email and a wrong password.
    return { error: error.code === "email_not_confirmed" ? e.confirmEmail : e.noMatch };
  }

  // Remember the language this person chose, so the sign-in page speaks it next time too.
  const membership = await supabase
    .from("memberships")
    .select("language")
    .eq("user_id", data.user.id)
    .eq("is_active", true)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (isLanguage(membership.data?.language)) {
    await rememberLanguage(membership.data.language);
  }

  // Back to where they were going, such as an invitation link. Only ever a page on this site.
  const destination = safeDestination(text(form, "next"), await siteOrigin(), "/app");
  // With two-step sign-in on, the password was only the first step.
  const level = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (level.data?.currentLevel === "aal1" && level.data.nextLevel === "aal2") {
    redirect(`/login/code?next=${encodeURIComponent(destination)}`);
  }
  redirect(destination);
}

export async function signUp(_state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const { m } = await getVisitorI18n();
  const e = m.auth.errors;
  if (await isRateLimited()) return { error: m.errors.slowDown };
  const parsed = parse(form, m);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const origin = await siteOrigin();
  const destination = safeDestination(text(form, "next"), origin, "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${origin}/auth/confirm?next=${encodeURIComponent(destination)}` },
  });
  if (error) {
    if (isUnreachable(error)) return { error: e.unreachable };
    if (error.code === "weak_password") return { error: e.weakPassword };
    if (error.code === "over_email_send_rate_limit") return { error: e.tooMany };
    console.error("signUp failed", error.code, error.message);
    return { error: e.couldNotCreate };
  }
  // With email confirmation on, there is no session yet.
  if (!data.session) return { ok: m.auth.checkEmail };
  redirect(destination);
}

/**
 * Email a link to choose a new password. The same answer whether or not an
 * account uses the address, so the form cannot be used to find out who has one.
 */
export async function sendResetLink(_state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const { m } = await getVisitorI18n();
  const e = m.auth.errors;
  if (await isRateLimited()) return { error: m.errors.slowDown };
  const parsed = credentials(m).shape.email.safeParse(form.get("email"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const origin = await siteOrigin();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
    redirectTo: `${origin}/auth/confirm?next=${encodeURIComponent("/login/new-password")}`,
  });
  if (error) {
    if (isUnreachable(error)) return { error: e.unreachable };
    if (error.code === "over_email_send_rate_limit") return { error: e.tooMany };
    // Anything else is not told: it could say whether the address has an account.
    console.error("resetPasswordForEmail failed", error.code, error.message);
  }
  return { ok: m.account.forgot.sent };
}

/** The new password, chosen after following the emailed link (which signed the person in). */
export async function setNewPassword(_state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const { m } = await getVisitorI18n();
  const e = m.auth.errors;
  const w = m.account.newPassword;
  if (await isRateLimited()) return { error: m.errors.slowDown };
  const parsed = credentials(m).shape.password.safeParse(form.get("password"));
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  // Only a session made by the emailed link, within the hour: any other session changes its password under More,
  // which asks for the current one.
  if (!madeByResetLink(claims?.claims)) return { error: w.expired };
  const { error } = await supabase.auth.updateUser({ password: parsed.data });
  if (error) {
    if (isUnreachable(error)) return { error: e.unreachable };
    if (error.code === "same_password") return { error: m.account.change.same };
    if (error.code === "weak_password") return { error: e.weakPassword };
    if (error.code === "insufficient_aal") return { error: w.needsCode };
    console.error("updateUser (reset) failed", error.code, error.message);
    return { error: m.account.change.couldNot };
  }
  redirect("/app");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
