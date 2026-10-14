"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
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
  return { ok: "Invitation saved. If that email has a Wagbook account, they will see it when they next sign in. If not, make them an invite link instead." };
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

const Member = z.object({
  userId: z.uuid(),
  displayName: z.string().trim().min(1, "Enter the person's name.").max(80),
  role: z.enum(["owner", "manager", "staff"]),
});

/** Change a colleague's name or role. Managers manage staff and managers; owners manage everyone (the policy decides). */
export async function updateMember(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const parsed = Member.safeParse({ userId: form.get("userId"), displayName: form.get("displayName"), role: form.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ display_name: parsed.data.displayName, role: parsed.data.role })
    .eq("org_id", org.id)
    .eq("user_id", parsed.data.userId)
    .select("user_id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "You do not have permission to change that person." };
  revalidatePath("/app", "layout");
  return { ok: "Saved." };
}

/** Suspend someone (they lose access at once, their history stays) or let them back in. */
export async function setMemberActive(_state: FormState, form: FormData): Promise<FormState> {
  const { org, user } = await requireOrg();
  const id = z.uuid().safeParse(form.get("userId"));
  if (!id.success) return { error: "That person could not be found." };
  if (id.data === user.id) return { error: "You cannot suspend yourself." };
  const active = form.get("active") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ is_active: active }).eq("org_id", org.id).eq("user_id", id.data).select("user_id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "You do not have permission to change that person." };
  revalidatePath("/app", "layout");
  return { ok: active ? "They can use Wagbook here again." : "Suspended. They cannot see anything here until you restore them." };
}

const Link = z.object({
  displayName: z.string().trim().min(1, "Enter the person's name.").max(80),
  role: z.enum(["owner", "manager", "staff"]),
});

/** Make a one-time link for someone with no account yet. Shown once, to send on WhatsApp. */
export async function createInviteLink(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const parsed = Link.safeParse({ displayName: form.get("displayName"), role: form.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_invitation_link", { p_org: org.id, p_role: parsed.data.role, p_display_name: parsed.data.displayName });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app/more/people");
  // The page lists open links with their address; the token itself stays out of the URL and server logs.
  redirect("/app/more/people?made=1");
}

/** Withdraw a link that has not been used. */
export async function revokeInviteLink(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const id = z.uuid().safeParse(form.get("linkId"));
  if (!id.success) return { error: "That link could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitation_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .is("used_at", null)
    .select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "That link was already used or withdrawn." };
  revalidatePath("/app/more/people");
  return { ok: "Link withdrawn. It no longer works." };
}
