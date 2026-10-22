"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { BUCKET } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

/**
 * Remove a downloaded month's photos from Wagbook (M49, D49). Owners only;
 * the database gives the list only once the month was downloaded, and storage
 * lets only owners delete. The small copies stay.
 */
export async function removePhotoMonth(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.photoArchive;
  if (!canDelete) return { error: w.ownersRemove };
  const month = text(form, "month") ?? "";
  if (!/^\d{4}-\d{2}-01$/.test(month)) return { error: t.m.errors.codes.WB241 };

  const supabase = await createClient();
  const files = await supabase.rpc("photo_month_files", { p_org: org.id, p_month: month });
  if (files.error) return { error: friendlyError(files.error, t) };
  const paths = await supabase.rpc("photos_to_remove", { p_org: org.id, p_month: month });
  if (paths.error) return { error: friendlyError(paths.error, t) };

  const list = paths.data as unknown as string[];
  let removed = 0;
  for (let i = 0; i < list.length; i += 100) {
    const { data, error } = await supabase.storage.from(BUCKET).remove(list.slice(i, i + 100));
    if (error) return { error: w.couldNotRemove };
    removed += data.length;
  }
  if (removed < list.length) return { error: w.couldNotRemove };
  const bytes = files.data.reduce((sum, f) => sum + Number(f.bytes), 0);
  const { error } = await supabase.rpc("record_photo_removal", { p_org: org.id, p_month: month, p_files: removed, p_bytes: bytes });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more/photos");
  // The month's row loses its form once the photos are gone, so the sentence goes with the page instead.
  redirect("/app/more/photos?done=removed");
}
