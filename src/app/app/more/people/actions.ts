"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const Invite = z.object({
  email: z.email("Enter the person's email address.").max(254),
  displayName: z.string().trim().min(1, "Enter the person's name.").max(80),
  role: z.enum(["owner", "manager", "staff"]),
});

/**
 * Invite someone who already has a Wagbook account. They see the invitation
 * the next time they sign in and become a member only when they accept.
 *
 * The answer is the same whether or not the email has an account, on purpose:
 * otherwise this form could be used to find out who uses Wagbook.
 */
export async function inviteMember(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const parsed = Invite.safeParse({ email: form.get("email"), displayName: form.get("displayName"), role: form.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_member_by_email", {
    p_org: org.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_display_name: parsed.data.displayName,
  });
  if (error) return { error: friendlyError(error) };

  revalidatePath("/app/more/people");
  return { ok: "Invitation saved. If that email has a Wagbook account, they will see it when they next sign in. If not, ask them to create an account, then invite them again." };
}

/** Remove a member, or withdraw an invitation that has not been answered. */
export async function removeMember(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const id = z.uuid().safeParse(form.get("userId"));
  if (!id.success) return { error: "That person could not be found." };

  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").delete().eq("org_id", org.id).eq("user_id", id.data).select("user_id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "You do not have permission to remove that person." };

  revalidatePath("/app", "layout");
  return {};
}
