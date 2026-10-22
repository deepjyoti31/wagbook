import "server-only";
import type { createClient } from "./supabase/server";

/**
 * The team (M43): who can be on the rota and clock in. Riders keep no rota
 * (D48), and people suspended or still invited are not working here now.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface Worker {
  user_id: string;
  display_name: string;
  role: "owner" | "manager" | "staff" | "rider";
  lives_on_site: boolean;
}

/** People working at the kennel now who keep a rota: owners, managers and staff, in the order they joined. */
export async function workers(supabase: Supabase, orgId: string): Promise<Worker[]> {
  const { data } = await supabase
    .from("memberships")
    .select("user_id, display_name, role, lives_on_site")
    .eq("org_id", orgId)
    .eq("is_active", true)
    .neq("role", "rider")
    .order("created_at");
  return data ?? [];
}

export interface MonthStretch {
  id: string;
  user_id: string;
  work_date: string;
  clocked_in_at: string;
  clocked_out_at: string | null;
  note: string | null;
}

/**
 * A month's attendance as the reader may see it (M43): everyone's for an
 * owner or manager, their own for anyone else (row level security says the
 * same; the filter keeps a member of two kennels to this one). People are
 * those working here who keep a rota, and anyone with attendance that month.
 */
export async function monthAttendance(
  supabase: Supabase,
  ctx: { orgId: string; userId: string; canManage: boolean },
  first: string,
  last: string,
) {
  const mine = <Q extends { eq: (column: string, value: string) => Q }>(q: Q) => (ctx.canManage ? q : q.eq("user_id", ctx.userId));
  const [stretches, leave, rota, members] = await Promise.all([
    mine(supabase.from("attendance").select("id, user_id, work_date, clocked_in_at, clocked_out_at, note").eq("org_id", ctx.orgId))
      .gte("work_date", first)
      .lte("work_date", last)
      .order("clocked_in_at")
      .limit(5000),
    mine(supabase.from("leave_requests").select("user_id, starts_on, ends_on").eq("org_id", ctx.orgId))
      .eq("status", "granted")
      .lte("starts_on", last)
      .gte("ends_on", first)
      .limit(1000),
    mine(supabase.from("rota").select("user_id, work_date").eq("org_id", ctx.orgId))
      .gte("work_date", first)
      .lte("work_date", last)
      .limit(5000),
    mine(supabase.from("memberships").select("user_id, display_name, role, is_active").eq("org_id", ctx.orgId))
      .neq("role", "rider")
      .order("created_at"),
  ]);
  if (stretches.error || leave.error || rota.error || members.error) throw new Error("Could not load attendance.");
  const counted = new Set(stretches.data.map((s) => s.user_id));
  const people = members.data.filter((p) => p.is_active || counted.has(p.user_id)).map((p) => ({ user_id: p.user_id, display_name: p.display_name }));
  return { people, stretches: stretches.data as MonthStretch[], leave: leave.data, rota: rota.data };
}
