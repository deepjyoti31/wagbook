import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MonthPicker } from "@/components/month-picker";
import { PhotoInput } from "@/components/photo-input";
import { Rich } from "@/components/rich";
import { buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { PAYMENT_METHODS } from "@/lib/billing";
import { formatDate, formatMoney, isYearMonth, monthBounds, monthName, todayIn } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { signedUrls } from "@/lib/media";
import { EXPENSE_CATEGORIES } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";
import { addExpense, deleteExpense } from "./actions";

export const generateMetadata = () => appTitle((m) => m.expenses.title);

export default function ExpensesPage({ searchParams }: PageProps<"/app/more/expenses">) {
  return (
    <Suspense fallback={<Loading />}>
      <Expenses searchParams={searchParams} />
    </Suspense>
  );
}

async function Expenses({ searchParams }: Pick<PageProps<"/app/more/expenses">, "searchParams">) {
  const query = await searchParams;
  const { org, canManage } = await requireOrg();
  const { m, language, locale } = await getAppI18n();
  const x = m.expenses;
  const title = <PageTitle title={x.title} />;
  if (!canManage)
    return (
      <>
        {title}
        <Empty>{x.managersOnly}</Empty>
      </>
    );

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
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const total = rows.data.reduce((n, r) => n + r.amount_minor, 0);
  const byCategory = [...rows.data.reduce((acc, r) => acc.set(r.category, (acc.get(r.category) ?? 0) + r.amount_minor), new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  // The usual categories in the reader's words, then any other the kennel has used. A category is saved as typed.
  const categories = [...new Set([...EXPENSE_CATEGORIES.map((c) => x.categories[c]), ...used.data.map((u) => u.category)])];

  return (
    <>
      {title}
      <MonthPicker month={month} href={(mo) => `/app/more/expenses?month=${mo}`} locale={locale} words={m.common} />
      {query.done === "deleted" ? <Notice tone="ok">{x.removed}</Notice> : null}

      <Section title={x.addTitle}>
        <ActionForm action={addExpense} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={x.amount}>
              <Input name="amount" inputMode="decimal" required autoComplete="off" />
            </Field>
            <Field label={x.whatFor}>
              <Input name="category" required maxLength={60} list="expense-categories" autoComplete="off" />
              <datalist id="expense-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label={x.date}>
              <Input name="spentOn" type="date" required defaultValue={today} max={today} />
            </Field>
            <Field label={x.paidBy}>
              <Select name="method" defaultValue="">
                <option value="">{m.common.notSaid}</option>
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>
                    {m.labels.paymentMethod[p]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={x.shop}>
              <Input name="vendor" maxLength={120} autoComplete="off" />
            </Field>
          </div>
          <Field label={x.note}>
            <Textarea name="description" rows={2} maxLength={500} />
          </Field>
          <PhotoInput name="receipt" label={x.receipt} accept="image/*,application/pdf" words={m.photos} />
          <SubmitButton pendingLabel={m.common.saving}>{x.add}</SubmitButton>
        </ActionForm>
      </Section>

      <Section title={fill(x.spentIn, { month: monthName(month, locale) })}>
        <p className="mb-3 text-lg">
          <Rich text={plural(language, rows.data.length, x.total)} parts={{ amount: <strong className="font-extrabold">{money(total)}</strong> }} />{" "}
          <Link href={`/app/more/reports?month=${month}`} className="font-semibold underline underline-offset-4">
            {x.seeReport}
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
          <Empty>{x.none}</Empty>
        ) : (
          <ul className="space-y-3">
            {rows.data.map((r) => (
              <li key={r.id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="flex flex-wrap items-baseline gap-x-3">
                  <span className="font-bold">{r.category}</span>
                  <span className="flex-1 text-slate">{formatDate(r.spent_on, locale)}</span>
                  <span className="text-lg font-bold tabular-nums">{money(r.amount_minor)}</span>
                </p>
                {r.vendor || r.method ? <p className="text-slate">{[r.vendor, r.method ? m.labels.paymentMethod[r.method] : null].filter(Boolean).join(", ")}</p> : null}
                {r.description ? <p className="whitespace-pre-line">{r.description}</p> : null}
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {r.receipt_path && receipts.get(r.receipt_path) ? (
                    <a href={receipts.get(r.receipt_path)} target="_blank" rel="noreferrer" className={buttonStyles.quiet}>
                      {x.seeReceipt}
                    </a>
                  ) : null}
                  <ActionForm action={deleteExpense} className="contents">
                    <input type="hidden" name="expenseId" value={r.id} />
                    <input type="hidden" name="month" value={month} />
                    <SubmitButton variant="quiet" pendingLabel={m.common.removing}>
                      {m.common.remove}
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
