"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { rememberOrg, requireUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { getVisitorI18n, type I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/** A new kennel as typed, with each refusal in the reader's language. */
function newOrg(m: I18n["m"]) {
  const e = m.onboarding.errors;
  return z.object({
    name: z.string().trim().min(2, e.kennelName).max(80, e.kennelName),
    slug: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, e.linkName),
    displayName: z.string().trim().min(1, e.yourName).max(80, e.yourName),
  });
}

export async function createOrganization(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const t = await getVisitorI18n();
  const parsed = newOrg(t.m).safeParse({ name: form.get("name"), slug: form.get("slug"), displayName: form.get("displayName") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_display_name: parsed.data.displayName,
  });
  if (error) return { error: friendlyError(error, t) };

  await rememberOrg(data);
  redirect("/app/more/kennels?welcome=1");
}

/** Accept or decline an invitation to someone else's kennel. */
export async function respondToInvitation(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const t = await getVisitorI18n();
  const orgId = z.uuid().safeParse(form.get("orgId"));
  if (!orgId.success) return { error: t.m.onboarding.errors.invitationNotFound };
  const accept = form.get("accept") === "true";

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_invitation", { p_org: orgId.data, p_accept: accept });
  if (error) return { error: friendlyError(error, t) };

  revalidatePath("/", "layout");
  if (!accept) return { ok: t.m.onboarding.declined };
  await rememberOrg(orgId.data);
  redirect("/app");
}
