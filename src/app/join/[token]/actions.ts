"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rememberOrg, requireUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { getVisitorI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/** Join the kennel an invitation link is for. The database checks the link (accept_invitation_link). */
export async function joinWithLink(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const t = await getVisitorI18n();
  const token = form.get("token");
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return { error: t.m.join.incomplete };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation_link", { p_token: token });
  if (error) return { error: friendlyError(error, t) };
  await rememberOrg(data);
  revalidatePath("/", "layout");
  redirect("/app");
}
