"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { isISODate, parseMoney } from "@/lib/core";
import { PAYMENT_METHODS } from "@/lib/billing";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { readUpload, smallPath, store } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

const Expense = z.object({
  spentOn: z.string().refine(isISODate, "Choose the date it was spent."),
  category: z.string().min(1, "Say what it was for, like Food.").max(60, "Keep what it was for under 60 characters."),
  amount: z.number("Enter the amount, like 1250 or 1250.50.").int().positive("Enter an amount above zero."),
  method: z.enum(PAYMENT_METHODS, "Choose how it was paid.").nullable(),
  vendor: z.string().max(120, "Keep the shop or person under 120 characters.").nullable(),
  description: z.string().max(500, "Keep the note under 500 characters.").nullable(),
});

/** Write down money the kennel spent, with a photo or PDF of the receipt. Owners and managers only (the database says so too). */
export async function addExpense(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Expenses are for owners and managers." };
  const parsed = Expense.safeParse({
    spentOn: text(form, "spentOn") ?? "",
    category: text(form, "category") ?? "",
    amount: parseMoney(text(form, "amount") ?? "") ?? undefined,
    method: text(form, "method"),
    vendor: text(form, "vendor"),
    description: text(form, "description"),
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };

  const receipt = await readUpload(form.get("receipt"), { allowPdf: true });
  if (receipt && "error" in receipt) return { error: receipt.error };

  const supabase = await createClient();
  const id = crypto.randomUUID();
  let path: string | null = null;
  if (receipt) {
    path = `${org.id}/expenses/${id}.${receipt.extension}`;
    const failed = await store(supabase, path, receipt);
    if (failed) return { error: "The receipt could not be saved. Nothing was written down. Try again." };
    const small = receipt.extension === "jpg" ? await readUpload(form.get("receipt_small")) : null;
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
  if (error) return { error: friendlyError(error) };
  revalidatePath("/app/more", "layout");
  return { ok: "Expense written down." };
}

/** Remove an expense written down by mistake. Its receipt file stays in storage; the audit log keeps the row. */
export async function deleteExpense(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  if (!canManage) return { error: "Expenses are for owners and managers." };
  const id = z.uuid().safeParse(form.get("expenseId"));
  if (!id.success) return { error: "That expense could not be found." };
  const month = text(form, "month");

  const supabase = await createClient();
  const { error, count } = await supabase.from("expenses").delete({ count: "exact" }).eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error) };
  if (!count) return { error: "That expense could not be found." };
  revalidatePath("/app/more", "layout");
  redirect(`/app/more/expenses?${month && /^\d{4}-\d{2}$/.test(month) ? `month=${month}&` : ""}done=deleted`);
}
