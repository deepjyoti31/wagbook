"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMemberships, rememberOrg, requireOrg } from "@/lib/auth";
import { todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { getAppI18n } from "@/lib/i18n-server";
import { checked, text, type FormState } from "@/lib/forms";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/**
 * Check a pet in: mark the booking as in house and, if chosen, put it in a
 * kennel. The database stamps who did it and when, refuses a kennel that is
 * already taken, and starts producing the pet's daily care tasks.
 *
 * From the booking page the form also carries the check-in checklist:
 * belongings, what the parent said at the gate, and whether the vaccination
 * certificates were seen. From Today it does not, and those are left alone.
 */
export async function checkIn(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const bookingId = Id.safeParse(form.get("bookingId"));
  const kennel = form.get("kennelId");
  const kennelId = typeof kennel === "string" && kennel !== "" ? Id.safeParse(kennel) : null;
  if (!bookingId.success || (kennelId && !kennelId.success)) return { error: t.m.errors.bookingNotFound };

  const checklist: TablesUpdate<"bookings"> = {};
  if (form.has("checklist")) {
    checklist.belongings = text(form, "belongings");
    checklist.gate_notes = text(form, "gateNotes");
    // The database records the real time and person; any value marks it.
    checklist.vaccinations_checked_at = checked(form, "vaccinationsChecked") ? new Date().toISOString() : null;
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "checked_in", ...(kennelId ? { kennel_id: kennelId.data } : {}), ...checklist })
    .eq("org_id", org.id)
    .eq("id", bookingId.data)
    .eq("status", "confirmed")
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.errors.notWaitingForCheckIn };

  // Create today's care tasks for the new arrival. Safe to repeat.
  const tasks = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: todayIn(org.time_zone) });
  if (tasks.error) console.error("generate_care_tasks failed", tasks.error.message);

  revalidatePath("/app", "layout");
  // From the booking page, reopen it saying so: the check-in form is gone once the pet is in.
  if (form.get("from") === "booking") redirect(`/app/bookings/${bookingId.data}?done=checked_in`);
  if (form.get("from") === "today") redirect("/app?done=checked_in");
  return { ok: t.m.today.done.checked_in };
}

/** Check a pet out. The kennel becomes free for the next arrival. */
export async function checkOut(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: t.m.errors.bookingNotFound };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "checked_out" })
    .eq("org_id", org.id)
    .eq("id", bookingId.data)
    .eq("status", "checked_in")
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.errors.notCheckedIn };

  revalidatePath("/app", "layout");
  if (form.get("from") === "booking") redirect(`/app/bookings/${bookingId.data}?done=checked_out`);
  if (form.get("from") === "today") redirect(`/app?done=checked_out&booking=${bookingId.data}`);
  return { ok: t.m.today.checkedOut };
}

/**
 * For someone who works at more than one kennel: change which one they are
 * looking at. Membership is checked here, and again by requireOrg() on every
 * request, so a forged cookie gets nobody into a kennel they do not belong to.
 */
export async function switchOrganisation(form: FormData): Promise<void> {
  const orgId = Id.safeParse(form.get("orgId"));
  if (!orgId.success) redirect("/app/more");
  const memberships = await getMemberships();
  if (memberships.some((m) => m.organizations!.id === orgId.data)) await rememberOrg(orgId.data);
  revalidatePath("/app", "layout");
  redirect("/app");
}
