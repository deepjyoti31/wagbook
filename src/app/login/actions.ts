"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import type { FormState } from "@/lib/forms";
import { siteOrigin } from "@/lib/site";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

const Credentials = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address.")),
  password: z.string().min(8, "Use a password of at least 8 characters.").max(72, "That password is too long."),
});

const UNREACHABLE = "Could not reach the server. Check your connection and try again.";

/** True when the request never got an answer, as opposed to being refused. */
function isUnreachable(error: { name: string; status?: number }): boolean {
  return error.name === "AuthRetryableFetchError" || error.status === 0 || (error.status ?? 0) >= 500;
}

function parse(form: FormData) {
  return Credentials.safeParse({ email: form.get("email"), password: form.get("password") });
}

export async function signIn(_state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const parsed = parse(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (isUnreachable(error)) return { error: UNREACHABLE };
    // Deliberately the same message for a wrong email and a wrong password.
    return { error: error.code === "email_not_confirmed" ? "Confirm your email first. Check your inbox for the link." : "That email and password do not match." };
  }
  redirect("/app");
}

export async function signUp(_state: FormState, form: FormData): Promise<FormState> {
  if (!isSupabaseConfigured()) redirect("/setup");
  const parsed = parse(form);
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: { emailRedirectTo: `${await siteOrigin()}/auth/confirm?next=/onboarding` },
  });
  if (error) {
    if (isUnreachable(error)) return { error: UNREACHABLE };
    if (error.code === "weak_password") return { error: "That password is too easy to guess. Try a longer one." };
    if (error.code === "over_email_send_rate_limit") return { error: "Too many attempts. Wait a minute and try again." };
    console.error("signUp failed", error.code, error.message);
    return { error: "Could not create the account. Please try again." };
  }
  // With email confirmation on, there is no session yet.
  if (!data.session) return { ok: "Almost there. Open the link we just emailed you to confirm your address." };
  redirect("/onboarding");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
