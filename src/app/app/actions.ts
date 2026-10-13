"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getMemberships, rememberOrg, requireOrg } from "@/lib/auth";
import { todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/**
 * Check a pet in: mark the booking as in house and, if chosen, put it in a
 * kennel. The database stamps who did it and when, refuses a kennel that is
 * already taken, and starts producing the pet's daily care tasks.
 */
export async function checkIn(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const bookingId = Id.safeParse(form.get("bookingId"));
  const kennel = form.get("kennelId");
  const kennelId = typeof kennel === "string" && kennel !== "" ? Id.safeParse(kennel) : null;
  if (!bookingId.success || (kennelId && !kennelId.success)) return { error: "That booking could not be found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "checked_in", ...(kennelId ? { kennel_id: kennelId.data } : {}) })
    .eq("org_id", org.id)
    .eq("id", bookingId.data)
    .eq("status", "confirmed")
    .select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "This booking is no longer waiting to be checked in. Refresh the page." };

  // Create today's care tasks for the new arrival. Safe to repeat.
  const tasks = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: todayIn(org.time_zone) });
  if (tasks.error) console.error("generate_care_tasks failed", tasks.error.message);

  revalidatePath("/app", "layout");
  return { ok: "Checked in." };
}

/** Check a pet out. The kennel becomes free for the next arrival. */
export async function checkOut(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: "That booking could not be found." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: "checked_out" })
    .eq("org_id", org.id)
    .eq("id", bookingId.data)
    .eq("status", "checked_in")
    .select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "This pet is not checked in. Refresh the page." };

  revalidatePath("/app", "layout");
  return { ok: "Checked out." };
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
