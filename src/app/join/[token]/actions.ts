"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { rememberOrg, requireUser } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import type { FormState } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

/** Join the kennel an invitation link is for. The database checks the link (accept_invitation_link). */
export async function joinWithLink(_state: FormState, form: FormData): Promise<FormState> {
  await requireUser();
  const token = form.get("token");
  if (typeof token !== "string" || !/^[0-9a-f]{64}$/.test(token)) return { error: "That invitation link is not complete. Ask for a new one." };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("accept_invitation_link", { p_token: token });
  if (error) return { error: friendlyError(error) };
  await rememberOrg(data);
  revalidatePath("/", "layout");
  redirect("/app");
}
