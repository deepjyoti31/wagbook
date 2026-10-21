"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { skillsOffered, STAFF_SKILLS, type StaffSkill } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import type { Messages } from "@/messages";
import { createClient } from "@/lib/supabase/server";

// A rider (D45) sees only their own delivery run.
const ROLES = ["owner", "manager", "staff", "rider"] as const;

const invite = (m: Messages) =>
  z.object({
    email: z.email(m.people.errors.email).max(254),
    displayName: z.string().trim().min(1, m.people.errors.name).max(80),
    role: z.enum(ROLES),
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
  const t = await getAppI18n();
  const parsed = invite(t.m).safeParse({ email: form.get("email"), displayName: form.get("displayName"), role: form.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const supabase = await createClient();
  const { error } = await supabase.rpc("invite_member_by_email", {
    p_org: org.id,
    p_email: parsed.data.email,
    p_role: parsed.data.role,
    p_display_name: parsed.data.displayName,
  });
  if (error) return { error: friendlyError(error, t) };

  revalidatePath("/app/more/people");
  return { ok: t.m.people.invitationSaved };
}

/** Remove a member, or withdraw an invitation that has not been answered. Owners only (D29). */
export async function removeMember(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete } = await requireOrg();
  const t = await getAppI18n();
  if (!canDelete) return { error: t.m.errors.ownersDelete };
  const id = z.uuid().safeParse(form.get("userId"));
  if (!id.success) return { error: t.m.people.errors.personNotFound };

  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").delete().eq("org_id", org.id).eq("user_id", id.data).select("user_id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.people.errors.cannotRemove };

  revalidatePath("/app", "layout");
  return {};
}

const member = (m: Messages) =>
  z.object({
    userId: z.uuid(m.people.errors.personNotFound),
    displayName: z.string().trim().min(1, m.people.errors.name).max(80),
    role: z.enum(ROLES),
  });

/** Change a colleague's name or role. Managers manage staff and managers; owners manage everyone (the policy decides). */
export async function updateMember(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const parsed = member(t.m).safeParse({ userId: form.get("userId"), displayName: form.get("displayName"), role: form.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .update({ display_name: parsed.data.displayName, role: parsed.data.role })
    .eq("org_id", org.id)
    .eq("user_id", parsed.data.userId)
    .select("user_id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.people.errors.cannotChange };
  revalidatePath("/app", "layout");
  return { ok: t.m.common.saved };
}

/** Suspend someone (they lose access at once, their history stays) or let them back in. */
export async function setMemberActive(_state: FormState, form: FormData): Promise<FormState> {
  const { org, user } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.people;
  const id = z.uuid().safeParse(form.get("userId"));
  if (!id.success) return { error: w.errors.personNotFound };
  if (id.data === user.id) return { error: w.errors.notYourself };
  const active = form.get("active") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase.from("memberships").update({ is_active: active }).eq("org_id", org.id).eq("user_id", id.data).select("user_id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: w.errors.cannotChange };
  revalidatePath("/app", "layout");
  return { ok: active ? w.restored : w.suspendedDone };
}

const link = (m: Messages) =>
  z.object({
    displayName: z.string().trim().min(1, m.people.errors.name).max(80),
    role: z.enum(ROLES),
  });

/** Make a one-time link for someone with no account yet. Shown once, to send on WhatsApp. */
export async function createInviteLink(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const parsed = link(t.m).safeParse({ displayName: form.get("displayName"), role: form.get("role") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_invitation_link", { p_org: org.id, p_role: parsed.data.role, p_display_name: parsed.data.displayName });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more/people");
  // The page lists open links with their address; the token itself stays out of the URL and server logs.
  redirect("/app/more/people?made=1");
}

/** Withdraw a link that has not been used. */
export async function revokeInviteLink(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = z.uuid().safeParse(form.get("linkId"));
  if (!id.success) return { error: t.m.people.errors.linkNotFound };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("invitation_links")
    .update({ revoked_at: new Date().toISOString() })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .is("used_at", null)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.people.errors.linkGone };
  revalidatePath("/app/more/people");
  return { ok: t.m.people.linkWithdrawn };
}

/**
 * Set what a person can be given to do (M25). Only the skills for what the
 * kennel offers are on the form, so the others the person has are kept.
 * Owners and managers; only owners set an owner's (the policy decides).
 */
export async function setSkills(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.skills.errors.onlyManagers };
  const id = z.uuid().safeParse(form.get("userId"));
  if (!id.success) return { error: t.m.people.errors.personNotFound };
  const offered = skillsOffered(org);
  const supabase = await createClient();
  const current = await supabase.from("memberships").select("skills").eq("org_id", org.id).eq("user_id", id.data).maybeSingle();
  if (current.error) return { error: friendlyError(current.error, t) };
  if (!current.data) return { error: t.m.people.errors.personNotFound };
  const kept = current.data.skills.filter((s) => !offered.includes(s));
  const chosen = offered.filter((s) => form.get(`skill_${s}`) === "on");
  const skills: StaffSkill[] = STAFF_SKILLS.filter((s) => kept.includes(s) || chosen.includes(s));
  const { data, error } = await supabase.from("memberships").update({ skills }).eq("org_id", org.id).eq("user_id", id.data).select("user_id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.skills.errors.onlyManagers };
  revalidatePath("/app/more/people");
  return { ok: t.m.skills.saved };
}
