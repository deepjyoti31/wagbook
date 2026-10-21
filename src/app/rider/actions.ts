"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireRider } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { i18nFor } from "@/lib/i18n-server";
import { readUpload, store } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

/**
 * A rider marks a stop of their own run for today: on the way, delivered
 * (with a photo at the door), nobody home or refused. The database checks it
 * is their run and today (rider_mark_stop, D45); the photo may go only into
 * that stop's folder (rider_upload_allowed).
 */
export async function markStop(_state: FormState, form: FormData): Promise<FormState> {
  const { language } = await requireRider();
  const t = i18nFor(language);
  const delivery = z.uuid().safeParse(form.get("deliveryId"));
  const org = z.uuid().safeParse(form.get("orgId"));
  const status = z.enum(["out", "delivered", "not_home", "refused"]).safeParse(form.get("status"));
  if (!delivery.success || !org.success || !status.success) return { error: t.m.errors.notFound };
  const supabase = await createClient();
  let path: string | undefined;
  if (status.data === "delivered") {
    const photo = await readUpload(form.get("photo"), t.m);
    if (photo && "error" in photo) return { error: photo.error };
    if (photo) {
      path = `${org.data}/deliveries/${delivery.data}/door-${crypto.randomUUID()}.jpg`;
      if (await store(supabase, path, photo)) return { error: t.m.rider.errors.photo };
    }
  }
  const { error } = await supabase.rpc("rider_mark_stop", { p_delivery: delivery.data, p_status: status.data, p_proof_path: path });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/rider");
  return { ok: fill(t.m.rider.marked, { status: t.m.deliveryStatus[status.data] }) };
}
