"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { isLanguage } from "@/lib/i18n";
import { getAppI18n, rememberLanguage } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * Choose the language Wagbook speaks to you in, for every kennel you work at.
 * The database keeps it (set_my_language), and a cookie remembers it on this
 * browser so the sign-in page speaks it too.
 */
export async function setMyLanguage(_state: FormState, form: FormData): Promise<FormState> {
  await requireOrg();
  const t = await getAppI18n();
  const language = form.get("language");
  if (!isLanguage(language)) return { error: t.m.errors.codes.WB013 };

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_my_language", { p_language: language });
  if (error) return { error: friendlyError(error, t) };

  await rememberLanguage(language);
  revalidatePath("/app", "layout");
  redirect("/app/more?done=language");
}
