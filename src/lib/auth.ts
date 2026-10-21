import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { isLanguage, type Language } from "./i18n";
import type { Enums, Tables } from "./supabase/database.types";
import { isSupabaseConfigured } from "./supabase/env";
import { createClient } from "./supabase/server";

/**
 * The data access layer for "who is asking".
 *
 * Every protected page and every Server Action starts with requireOrg() (or
 * requireUser()). Nothing else in the app reads the session directly.
 * `cache` makes repeated calls within one request free.
 */

export interface SessionUser {
  id: string;
  email: string | null;
}

export interface OrgContext {
  user: SessionUser;
  org: Tables<"organizations">;
  role: Enums<"member_role">;
  displayName: string;
  /** The language this person chose to read Wagbook in. */
  language: Language;
  /** True for owners and managers. */
  canManage: boolean;
  /** True for owners: only they delete things (D29). */
  canDelete: boolean;
}

/** Cookie remembering which organisation a person with several is working in. */
export const ORG_COOKIE = "wb_org";

export const getUser = cache(async (): Promise<SessionUser | null> => {
  // Who is asking can only be known per request. Saying so first means a page
  // that calls this can never be prerendered at build time by accident.
  await connection();
  if (!isSupabaseConfigured()) return null;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) return null;
  return { id: claims.sub, email: typeof claims.email === "string" ? claims.email : null };
});

export async function requireUser(): Promise<SessionUser> {
  // Per request, always, even when the answer is the setup page: a page that
  // asks who is signed in must never be saved at build time.
  await connection();
  if (!isSupabaseConfigured()) redirect("/setup");
  const user = await getUser();
  if (!user) redirect("/login");
  if (await owesCode()) redirect("/login/code");
  return user;
}

/**
 * True when this person has turned on two-step sign-in and this session has
 * not given its code yet. Read from the session cookie, so it usually costs
 * nothing; the database decides for itself (session_meets_mfa), and
 * requireOrg() asks it when the cookie may be out of date. A session that
 * used a recovery code (D43) still reads aal1 in its cookie, so then the
 * database is asked.
 */
export const owesCode = cache(async (): Promise<boolean> => {
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!(data?.currentLevel === "aal1" && data.nextLevel === "aal2")) return false;
  return !(await usedRecoveryCode());
});

/** True when this session got in with a recovery code instead of the app (D43). */
export const usedRecoveryCode = cache(async (): Promise<boolean> => {
  const { data } = await (await createClient()).rpc("session_meets_mfa");
  return data === true;
});

/** The signed-in user's organisations, oldest membership first. */
export const getMemberships = cache(async () => {
  const user = await requireUser();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("role, display_name, language, created_at, organizations(*)")
    .eq("user_id", user.id)
    .eq("is_active", true)
    .order("created_at");
  if (error) throw new Error(`Could not load your organisations: ${error.message}`);
  return data.filter((m) => m.organizations !== null);
});

/**
 * The organisation the user is working in, with their role.
 * Sends people with no organisation to /onboarding.
 */
export const requireOrg = cache(async (): Promise<OrgContext> => {
  const user = await requireUser();
  const memberships = await getMemberships();
  if (memberships.length === 0) {
    // Two-step sign-in turned on from another phone since this session began:
    // the database hides every kennel until the code is given.
    const { data: fullySignedIn } = await (await createClient()).rpc("session_meets_mfa");
    if (fullySignedIn === false) redirect("/login/code?check=1");
    redirect("/onboarding");
  }

  const preferred = (await cookies()).get(ORG_COOKIE)?.value;
  const chosen = memberships.find((m) => m.organizations!.id === preferred) ?? memberships[0];
  return {
    user,
    org: chosen.organizations!,
    role: chosen.role,
    displayName: chosen.display_name,
    language: isLanguage(chosen.language) ? chosen.language : "en",
    canManage: chosen.role === "owner" || chosen.role === "manager",
    canDelete: chosen.role === "owner",
  };
});

/**
 * Remember which organisation the user is working in. Only call from a Server
 * Action or Route Handler. The cookie is a preference, not a permission:
 * requireOrg() only honours it when the user really is a member.
 */
export async function rememberOrg(orgId: string): Promise<void> {
  (await cookies()).set(ORG_COOKIE, orgId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
