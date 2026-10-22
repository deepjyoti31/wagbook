"use server";

import { createClient as createPlainClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import type { FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { isRateLimited } from "@/lib/rate-limit-server";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";

/**
 * Change the signed-in person's password (M45). The current password is
 * checked first, on a separate connection that keeps no session, so this
 * session (and its two-step level) is left exactly as it is.
 */
export async function changePassword(_state: FormState, form: FormData): Promise<FormState> {
  const { user } = await requireOrg();
  const { m } = await getAppI18n();
  const w = m.account.change;
  const e = m.auth.errors;
  if (await isRateLimited()) return { error: m.errors.slowDown };
  const parsed = z
    .object({
      current: z.string().min(1, w.wrongCurrent).max(72, w.wrongCurrent),
      next: z.string().min(8, e.passwordShort).max(72, e.passwordLong),
    })
    .safeParse({ current: form.get("current"), next: form.get("next") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (!user.email) return { error: w.googleOnly };

  const check = createPlainClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const signedIn = await check.auth.signInWithPassword({ email: user.email, password: parsed.data.current });
  if (signedIn.error || signedIn.data.user?.id !== user.id) return { error: w.wrongCurrent };
  // Only the check's own session ends; the person's phones stay signed in.
  await check.auth.signOut({ scope: "local" });

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.next, current_password: parsed.data.current });
  if (error) {
    if (error.code === "same_password") return { error: w.same };
    if (error.code === "weak_password") return { error: e.weakPassword };
    if (error.code === "reauthentication_needed" || error.code === "insufficient_aal") return { error: w.signInAgain };
    console.error("updateUser (change) failed", error.code, error.message);
    return { error: w.couldNot };
  }
  return { ok: w.saved };
}
