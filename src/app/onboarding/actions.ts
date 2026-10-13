"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { rememberOrg, requireUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const NewOrg = z.object({
  name: z.string().trim().min(2, "Enter your kennel's name.").max(80),
  slug: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "The link name can use lower case letters, numbers and hyphens, 3 to 40 characters."),
  displayName: z.string().trim().min(1, "Enter your name.").max(80),
});

export async function createOrganization(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const parsed = NewOrg.safeParse({ name: form.get("name"), slug: form.get("slug"), displayName: form.get("displayName") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_organization", {
    p_name: parsed.data.name,
    p_slug: parsed.data.slug,
    p_display_name: parsed.data.displayName,
  });
  if (error) return { error: friendlyError(error) };

  await rememberOrg(data);
  redirect("/app/more/kennels?welcome=1");
}

/** Accept or decline an invitation to someone else's kennel. */
export async function respondToInvitation(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const orgId = z.uuid().safeParse(form.get("orgId"));
  if (!orgId.success) return { error: "That invitation could not be found." };
  const accept = form.get("accept") === "true";

  const supabase = await createClient();
  const { error } = await supabase.rpc("respond_to_invitation", { p_org: orgId.data, p_accept: accept });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/", "layout");
  if (!accept) return { ok: "Invitation declined." };
  await rememberOrg(orgId.data);
  redirect("/app");
}
