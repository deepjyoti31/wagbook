"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { parseMoney } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();

/** Add an extra to the price list: grooming, pick-up and drop, a bath. Owners and managers. */
export async function addExtraService(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can change the price list." };
  const name = text(form, "name");
  if (!name) return { error: "Enter what the extra is, like Grooming." };
  if (name.length > 80) return { error: "Keep the name under 80 characters." };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: "Enter the price as a number, like 2000." };
  const unit = form.get("unit") === "hour" ? "hour" : "each";

  const supabase = await createClient();
  const { error } = await supabase.from("services").insert({ org_id: org.id, kind: "addon", name, unit, price_minor: price });
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app", "layout");
  return { ok: `Added ${name}.` };
}

/** Change an extra's price. Bookings that already have it keep the price they were given. */
export async function changeExtraPrice(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can change the price list." };
  const id = Id.safeParse(form.get("serviceId"));
  if (!id.success) return { error: "That extra could not be found." };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: "Enter the price as a number, like 2000." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").update({ price_minor: price }).eq("org_id", org.id).eq("id", id.data).eq("kind", "addon").select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "That extra could not be found." };
  revalidatePath("/app", "layout");
  return { ok: "Price changed." };
}

/** Take an extra off the price list. Past bookings that used it are not changed. */
export async function removeExtraService(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Only an owner or manager can change the price list." };
  const id = Id.safeParse(form.get("serviceId"));
  if (!id.success) return { error: "That extra could not be found." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").update({ is_active: false }).eq("org_id", org.id).eq("id", id.data).eq("kind", "addon").select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "That extra could not be found." };
  revalidatePath("/app", "layout");
  return { ok: "Taken off the price list." };
}
