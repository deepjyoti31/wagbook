import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MonthPicker } from "@/components/month-picker";
import { PhotoInput } from "@/components/photo-input";
import { buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from "@/lib/billing";
import { formatDate, formatMoney, isYearMonth, monthBounds, monthName, todayIn } from "@/lib/core";
import { signedUrls } from "@/lib/media";
import { EXPENSE_CATEGORIES } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { addExpense, deleteExpense } from "./actions";

export const metadata: Metadata = { title: "Expenses" };

export default function ExpensesPage({ searchParams }: PageProps<"/app/more/expenses">) {
  return (
    <>
      <PageTitle title="Expenses" />
      <Suspense fallback={<Loading label="Loading expenses" />}>
        <Expenses searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Expenses({ searchParams }: Pick<PageProps<"/app/more/expenses">, "searchParams">) {
  const query = await searchParams;
  const { org, canManage } = await requireOrg();
  if (!canManage) return <Empty>Expenses are for owners and managers.</Empty>;

  const today = todayIn(org.time_zone);
  const month = isYearMonth(query.month) ? query.month : today.slice(0, 7);
  const { first, last } = monthBounds(month);
  const supabase = await createClient();
  const [rows, used] = await Promise.all([
    supabase
      .from("expenses")
      .select("id, spent_on, category, vendor, description, amount_minor, method, receipt_path")
      .eq("org_id", org.id)
      .gte("spent_on", first)
      .lte("spent_on", last)
      .order("spent_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(1000),
    supabase.from("expenses").select("category").eq("org_id", org.id).order("spent_on", { ascending: false }).limit(500),
  ]);
  if (rows.error || used.error) throw new Error("Could not load expenses.");

  const receipts = await signedUrls(supabase, rows.data.map((r) => r.receipt_path));
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale: org.locale, trimZeros: true });
  const total = rows.data.reduce((n, r) => n + r.amount_minor, 0);
  const byCategory = [...rows.data.reduce((m, r) => m.set(r.category, (m.get(r.category) ?? 0) + r.amount_minor), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const categories = [...new Set([...EXPENSE_CATEGORIES, ...used.data.map((u) => u.category)])];

  return (
    <>
      <MonthPicker month={month} href={(m) => `/app/more/expenses?month=${m}`} locale={org.locale} />
      {query.done === "deleted" ? <Notice tone="ok">Expense removed.</Notice> : null}

      <Section title="Add an expense">
        <ActionForm action={addExpense} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Amount">
              <Input name="amount" inputMode="decimal" required autoComplete="off" />
            </Field>
            <Field label="What for">
              <Input name="category" required maxLength={60} list="expense-categories" autoComplete="off" />
              <datalist id="expense-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Date">
              <Input name="spentOn" type="date" required defaultValue={today} max={today} />
            </Field>
            <Field label="Paid by">
              <Select name="method" defaultValue="">
                <option value="">Not said</option>
                {PAYMENT_METHODS.map((m) => (
                  <option key={m} value={m}>
                    {PAYMENT_METHOD_LABEL[m]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Shop or person">
              <Input name="vendor" maxLength={120} autoComplete="off" />
            </Field>
          </div>
          <Field label="Note">
            <Textarea name="description" rows={2} maxLength={500} />
          </Field>
          <PhotoInput name="receipt" label="Receipt, a photo or a PDF" accept="image/*,application/pdf" />
          <SubmitButton pendingLabel="Saving">Add expense</SubmitButton>
        </ActionForm>
      </Section>

      <Section title={`Spent in ${monthName(month, org.locale)}`}>
        <p className="mb-3 text-lg">
          <strong className="font-extrabold">{money(total)}</strong> on {rows.data.length} {rows.data.length === 1 ? "expense" : "expenses"}.{" "}
          <Link href={`/app/more/reports?month=${month}`} className="font-semibold underline underline-offset-4">
            See the month&apos;s report
          </Link>
        </p>
        {byCategory.length > 0 ? (
          <ul className="mb-4 divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {byCategory.map(([category, amount]) => (
              <li key={category} className="flex min-h-12 items-center gap-3 px-4 py-2">
                <span className="flex-1 font-semibold">{category}</span>
                <span className="tabular-nums">{money(amount)}</span>
              </li>
            ))}
          </ul>
        ) : null}
        {rows.data.length === 0 ? (
          <Empty>Nothing written down for this month.</Empty>
        ) : (
          <ul className="space-y-3">
            {rows.data.map((r) => (
              <li key={r.id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-bold">{r.category}</span>
                  <span className="flex-1 text-slate">{formatDate(r.spent_on, org.locale)}</span>
                  <span className="text-lg font-bold tabular-nums">{money(r.amount_minor)}</span>
                </p>
                {r.vendor || r.method ? <p className="text-slate">{[r.vendor, r.method ? PAYMENT_METHOD_LABEL[r.method] : null].filter(Boolean).join(", ")}</p> : null}
                {r.description ? <p className="whitespace-pre-line">{r.description}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.receipt_path && receipts.get(r.receipt_path) ? (
                    <a href={receipts.get(r.receipt_path)} target="_blank" rel="noreferrer" className={buttonStyles.quiet}>
                      See receipt
                    </a>
                  ) : null}
                  <ActionForm action={deleteExpense} className="contents">
                    <input type="hidden" name="expenseId" value={r.id} />
                    <input type="hidden" name="month" value={month} />
                    <SubmitButton variant="quiet" pendingLabel="Removing">
                      Remove
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}
