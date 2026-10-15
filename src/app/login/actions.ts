"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { text, type FormState } from "@/lib/forms";
import { isLanguage } from "@/lib/i18n";
import { getVisitorI18n, rememberLanguage, type I18n } from "@/lib/i18n-server";
import { safeDestination } from "@/lib/safe-redirect";
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
  redirect(safeDestination(text(form, "next"), await siteOrigin(), "/app"));
}

export async function signUp(_state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const { m } = await getVisitorI18n();
  const e = m.auth.errors;
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

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
