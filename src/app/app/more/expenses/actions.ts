"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, parseMoney } from "@/lib/core";
import { PAYMENT_METHODS } from "@/lib/billing";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { getAppI18n } from "@/lib/i18n-server";
import { readUpload, smallPath, store } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

/** Write down money the kennel spent, with a photo or PDF of the receipt. Owners and managers only (the database says so too). */
export async function addExpense(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const x = t.m.expenses;
  if (!canManage) return { error: x.managersOnly };
  const Expense = z.object({
    spentOn: z.string().refine(isISODate, x.errors.date),
    category: z.string().min(1, x.errors.category).max(60, x.errors.categoryTooLong),
    amount: z.number(x.errors.amount).int().positive(x.errors.amountAboveZero),
    method: z.enum(PAYMENT_METHODS, x.errors.method).nullable(),
    vendor: z.string().max(120, x.errors.shopTooLong).nullable(),
    description: z.string().max(500, x.errors.noteTooLong).nullable(),
  });
  const parsed = Expense.safeParse({
    spentOn: text(form, "spentOn") ?? "",
    category: text(form, "category") ?? "",
    amount: parseMoney(text(form, "amount") ?? "") ?? undefined,
    method: text(form, "method"),
    vendor: text(form, "vendor"),
    description: text(form, "description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const receipt = await readUpload(form.get("receipt"), t.m, { allowPdf: true });
  if (receipt && "error" in receipt) return { error: receipt.error };

  const supabase = await createClient();
  const id = crypto.randomUUID();
  let path: string | null = null;
  if (receipt) {
    path = `${org.id}/expenses/${id}.${receipt.extension}`;
    const failed = await store(supabase, path, receipt);
    if (failed) return { error: x.errors.receiptFailed };
    const small = receipt.extension === "jpg" ? await readUpload(form.get("receipt_small"), t.m) : null;
    if (small && !("error" in small)) await store(supabase, smallPath(path), small);
  }

  const { error } = await supabase.from("expenses").insert({
    id,
    org_id: org.id,
    spent_on: parsed.data.spentOn,
    category: parsed.data.category,
    amount_minor: parsed.data.amount,
    method: parsed.data.method,
    vendor: parsed.data.vendor,
    description: parsed.data.description,
    receipt_path: path,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app/more", "layout");
  return { ok: x.written };
}

/** Remove an expense written down by mistake. Its receipt file stays in storage; the audit log keeps the row. */
export async function deleteExpense(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const x = t.m.expenses;
  if (!canManage) return { error: x.managersOnly };
  const id = z.uuid().safeParse(form.get("expenseId"));
  if (!id.success) return { error: x.errors.notFound };
  const month = text(form, "month");

  const supabase = await createClient();
  const { error, count } = await supabase.from("expenses").delete({ count: "exact" }).eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  if (!count) return { error: x.errors.notFound };
  revalidatePath("/app/more", "layout");
  redirect(`/app/more/expenses?${month && /^\d{4}-\d{2}$/.test(month) ? `month=${month}&` : ""}done=deleted`);
}
