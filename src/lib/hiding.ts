import type { createClient } from "./supabase/server";
import { friendlyError } from "./errors";
import type { getAppI18n } from "./i18n-server";

/**
 * Hide a pet or parent from lists, or show one again (deleted_at). The
 * database decides (guard_hiding()): owners and managers only, never while a
 * stay is requested, confirmed or in house, and a pet only once its parent is
 * shown. The checks here only give a clearer sentence first. Kept out of the
 * "use server" files, which may export only async actions.
 */
export async function setHidden(
  supabase: Awaited<ReturnType<typeof createClient>>,
  t: Awaited<ReturnType<typeof getAppI18n>>,
  orgId: string,
  table: "pets" | "clients",
  id: string,
  hide: boolean,
): Promise<string | null> {
  const w = t.m.hiding;
  if (hide) {
    const busy = await supabase
      .from("bookings")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq(table === "pets" ? "pet_id" : "client_id", id)
      .in("status", ["requested", "confirmed", "checked_in"]);
    if (busy.error) return friendlyError(busy.error, t);
    if ((busy.count ?? 0) > 0) return table === "pets" ? w.busyPet : w.busyParent;
  }
  const { data, error } = await supabase
    .from(table)
    .update({ deleted_at: hide ? new Date().toISOString() : null })
    .eq("org_id", orgId)
    .eq("id", id)
    .select("id");
  if (error) return friendlyError(error, t);
  if (data.length === 0) return table === "pets" ? t.m.errors.notFound : t.m.errors.parentNotFound;
  return null;
}
