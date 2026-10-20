"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { text, type FormState, type TwoStepSetup } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Step one: ask Supabase Auth for a new authenticator secret. Any earlier set
 * up that was never finished is thrown away first, so only one is pending.
 */
export async function startTwoStep(): Promise<TwoStepSetup> {
  await requireOrg();
  const { m } = await getAppI18n();
  const supabase = await createClient();
  const listed = await supabase.auth.mfa.listFactors();
  for (const f of listed.data?.all ?? []) {
    if (f.status === "unverified") await supabase.auth.mfa.unenroll({ factorId: f.id });
  }
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: "totp",
    // Supabase asks for a name unique to the person; the app shows its own words.
    friendlyName: `Wagbook ${new Date().toISOString().slice(0, 16)}`,
  });
  if (error || !data) return { error: m.twoStep.couldNotStart };
  return { factorId: data.id, qr: data.totp.qr_code, secret: data.totp.secret };
}

/** Step two: the first code from the app proves it was set up. Two-step sign-in is on from then. */
export async function confirmTwoStep(state: TwoStepSetup, form: FormData): Promise<TwoStepSetup> {
  await requireOrg();
  const { m } = await getAppI18n();
  const factorId = text(form, "factorId");
  const code = (text(form, "code") ?? "").replace(/\s+/g, "");
  if (!factorId || !/^[0-9a-f-]{36}$/.test(factorId)) return { error: m.twoStep.couldNotStart };
  if (!/^\d{6}$/.test(code)) return { ...state, error: m.twoStep.wrong };
  const supabase = await createClient();
  const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
  if (error) return { ...state, error: m.twoStep.wrong };
  // The new session cookie makes Next.js draw the page again, in its "on"
  // state; this sentence shows only if that does not happen.
  return { ok: m.twoStep.turnedOn };
}

/** Turn it off. Supabase Auth allows this only from a session that gave its code. */
export async function turnOffTwoStep(): Promise<FormState> {
  await requireOrg();
  const { m } = await getAppI18n();
  const supabase = await createClient();
  const listed = await supabase.auth.mfa.listFactors();
  if (listed.error) return { error: m.twoStep.couldNotStart };
  for (const f of listed.data.all) {
    const { error } = await supabase.auth.mfa.unenroll({ factorId: f.id });
    if (error) return { error: m.twoStep.couldNotStart };
  }
  // A fresh session, so the cookie no longer says a code is needed.
  await supabase.auth.refreshSession();
  revalidatePath("/app/more");
  return { ok: m.twoStep.turnedOff };
}
