"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const Bulk = z.object({
  prefix: z.string().max(20),
  count: z.coerce.number().int().min(1, "Add at least one kennel.").max(200, "Add at most 200 kennels at a time."),
  startAt: z.coerce.number().int().min(0).max(9999),
});

/**
 * Add a run of kennels in one go: prefix "K", 60 kennels, starting at 1 gives
 * K01 to K60. Names that already exist are left alone, so it is safe to repeat.
 */
export async function addKennels(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const parsed = Bulk.safeParse({ prefix: text(form, "prefix") ?? "", count: form.get("count"), startAt: form.get("startAt") ?? 1 });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const { prefix, count, startAt } = parsed.data;

  const width = Math.max(2, String(startAt + count - 1).length);
  const rows = Array.from({ length: count }, (_, i) => ({
    org_id: org.id,
    name: `${prefix}${String(startAt + i).padStart(width, "0")}`,
    sort_order: startAt + i,
  }));

  const supabase = await createClient();
  const { data, error } = await supabase.from("kennels").upsert(rows, { onConflict: "org_id,name", ignoreDuplicates: true }).select("id");
  if (error) return { error: friendlyError(error) };

  revalidatePath("/app", "layout");
  const added = data.length;
  return { ok: added === 0 ? "Those kennels already exist." : `Added ${added} ${added === 1 ? "kennel" : "kennels"}.` };
}

export async function setKennelActive(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const id = z.uuid().safeParse(form.get("kennelId"));
  if (!id.success) return { error: "That kennel could not be found." };
  const active = form.get("active") === "true";

  const supabase = await createClient();
  const { data, error } = await supabase.from("kennels").update({ is_active: active }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error) };
  if (data.length === 0) return { error: "Only an owner or manager can change kennels." };

  revalidatePath("/app", "layout");
  return {};
}
