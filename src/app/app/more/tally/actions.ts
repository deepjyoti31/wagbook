"use server";

import { revalidatePath } from "next/cache";
import { requireOrg } from "@/lib/auth";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { TALLY_FIELDS, type TallyColumn } from "@/lib/tally";

/** Save the ledger names the kennel's books in Tally use (M64). Owners and managers (the policy decides too). */
export async function saveTallyLedgers(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.tally.managersOnly };
  const names = {} as Record<TallyColumn, string>;
  for (const [column] of TALLY_FIELDS) {
    // One line: a name in Tally has no line breaks.
    const name = text(form, column)?.replace(/\s+/g, " ");
    if (!name || name.length > 100) return { error: t.m.tally.nameError };
    names[column] = name;
  }
  const company = text(form, "company")?.replace(/\s+/g, " ") ?? null;
  if (company !== null && company.length > 100) return { error: t.m.tally.nameError };
  const supabase = await createClient();
  const { error } = await supabase.from("tally_settings").upsert({ org_id: org.id, company, ...names });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more/tally");
  return { ok: t.m.tally.saved };
}
