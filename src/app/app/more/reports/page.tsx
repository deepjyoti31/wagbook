import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { MonthPicker } from "@/components/month-picker";
import { OccupancyChart } from "@/components/occupancy-chart";
import { Rich } from "@/components/rich";
import { buttonStyles, Empty, Field, Input, Loading, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { taxLabel } from "@/lib/billing";
import { formatDate, formatMoney, isYearMonth, monthBounds, monthName, shiftMonth, shortMonthName, summariseOccupancy, todayIn } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { DOWNLOADS } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.reports.title);

export default function ReportsPage({ searchParams }: PageProps<"/app/more/reports">) {
  return (
    <Suspense fallback={<Loading />}>
      <Reports searchParams={searchParams} />
    </Suspense>
  );
}

function Figure({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <div className="rounded-xl border border-rule bg-paper p-3">
      <p className="text-sm text-slate">{label}</p>
      <p className="text-xl font-extrabold tabular-nums">{children}</p>
      {hint ? <p className="text-sm text-slate">{hint}</p> : null}
    </div>
  );
}

async function Reports({ searchParams }: Pick<PageProps<"/app/more/reports">, "searchParams">) {
  const query = await searchParams;
  const { org, canManage } = await requireOrg();
  const { m, language, locale } = await getAppI18n();
  const r = m.reports;
  const title = <PageTitle title={r.title} />;
  if (!canManage)
    return (
      <>
        {title}
        <Empty>{r.managersOnly}</Empty>
      </>
    );

  const today = todayIn(org.time_zone);
  const month = isYearMonth(query.month) ? query.month : today.slice(0, 7);
  const { first, last } = monthBounds(month);
  const yearStart = monthBounds(shiftMonth(month, -11)).first;
  const supabase = await createClient();
  const args = { p_org: org.id, p_from: first, p_to: last };
  const [occupancy, money, tax, extras, owed] = await Promise.all([
    supabase.rpc("report_occupancy", args),
    supabase.rpc("report_money", { p_org: org.id, p_from: yearStart, p_to: last }),
    supabase.rpc("report_tax", args),
    supabase.rpc("report_extras", args),
    supabase.from("invoice_balances").select("due_minor").eq("org_id", org.id).eq("status", "issued").gt("due_minor", 0).limit(5000),
  ]);
  if (occupancy.error || money.error || tax.error || extras.error || owed.error) throw new Error("Could not add up the reports.");

  const fmt = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const days = occupancy.data.map((d) => ({ day: d.day, boarding: d.boarding, dayBoarding: d.day_boarding, capacity: d.capacity, kennelsUsed: d.kennels_used }));
  const stay = summariseOccupancy(days);
  const thisMonth = money.data.find((x) => x.month.slice(0, 7) === month);
  const owedTotal = owed.data.reduce((n, b) => n + (b.due_minor ?? 0), 0);
  const charged = org.tax_mode !== "none" || tax.data.some((x) => x.tax_minor > 0);
  const gst = org.tax_mode === "gst_india";
  const label = taxLabel(m, org.tax_mode, org.tax_label);
  // "Includes ₹540 GST", "Includes ₹540 tax", or the kennel's own name for its tax.
  const includes = (amount: string) => fill(gst ? r.includesGst : label === m.labels.tax ? r.includesTax : r.includesLabel, { amount, tax: label });
  const net = thisMonth ? thisMonth.received_minor - thisMonth.refunded_minor - thisMonth.spent_minor : 0;
  const name = monthName(month, locale);

  return (
    <>
      {title}
      <MonthPicker month={month} href={(x) => `/app/more/reports?month=${x}`} locale={locale} words={m.common} />

      <Section title={r.howFull}>
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure label={r.nightsSold}>{stay.nights}</Figure>
          <Figure label={r.dayBoardingDays}>{stay.days}</Figure>
          <Figure label={r.kennelsUsed}>{stay.percentFull === null ? r.noKennels : fill(r.percent, { n: stay.percentFull })}</Figure>
          <Figure label={r.busiestDay} hint={stay.busiest ? plural(language, stay.busiest.pets, r.pets) : undefined}>
            {stay.busiest ? formatDate(stay.busiest.day, locale).replace(/ \d{4}$/, "") : m.common.none}
          </Figure>
        </div>
        <OccupancyChart days={days} locale={locale} language={language} words={r.chart} />
        <p className="mt-2 text-sm text-slate">{r.countsNote}</p>
      </Section>

      <Section title={fill(r.moneyIn, { month: name })}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Figure label={r.billed} hint={charged && thisMonth ? includes(fmt(thisMonth.tax_minor)) : undefined}>
            {fmt(thisMonth?.billed_minor ?? 0)}
          </Figure>
          <Figure label={r.received}>{fmt(thisMonth?.received_minor ?? 0)}</Figure>
          {thisMonth && thisMonth.refunded_minor > 0 ? <Figure label={r.refunded}>{fmt(thisMonth.refunded_minor)}</Figure> : null}
          <Figure label={r.spent}>{fmt(thisMonth?.spent_minor ?? 0)}</Figure>
          <Figure label={r.net}>{fmt(net)}</Figure>
        </div>
        <p className="mt-3">
          {owed.data.length === 0 ? (
            r.nothingOwed
          ) : (
            <>
              <Rich text={plural(language, owed.data.length, r.owedToday)} parts={{ amount: <strong className="font-extrabold">{fmt(owedTotal)}</strong> }} />{" "}
              <Link href="/app/bills" className="font-semibold underline underline-offset-4">
                {r.seeBills}
              </Link>
            </>
          )}
        </p>
        <p className="mt-1">
          <Link href={`/app/more/expenses?month=${month}`} className="font-semibold underline underline-offset-4">
            {r.seeExpenses}
          </Link>
        </p>
      </Section>

      <Section title={r.monthByMonth}>
        <div className="relative overflow-x-auto rounded-xl border border-rule bg-paper">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-slate">
                <th className="px-3 py-2 font-semibold">{m.common.month}</th>
                <th className="px-2 py-2 text-right font-semibold">{r.billed}</th>
                <th className="px-2 py-2 text-right font-semibold">{r.received}</th>
                <th className="px-2 py-2 text-right font-semibold">{r.spent}</th>
              </tr>
            </thead>
            <tbody>
              {[...money.data].reverse().map((x) => (
                <tr key={x.month} className="border-b border-rule last:border-0">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 font-semibold">
                    <Link href={`/app/more/reports?month=${x.month.slice(0, 7)}`} className="underline underline-offset-4">
                      {fill(r.shortMonth, { month: shortMonthName(x.month.slice(0, 7), locale), year: x.month.slice(2, 4) })}
                    </Link>
                  </th>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{fmt(x.billed_minor)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{fmt(x.received_minor - x.refunded_minor)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{fmt(x.spent_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-slate">{r.billedNote}</p>
      </Section>

      {charged ? (
        <Section title={fill(r.taxByRate, { tax: label })}>
          {tax.data.length === 0 ? (
            <Empty>{fill(r.noBillsIn, { month: name })}</Empty>
          ) : (
            <ul className="space-y-2">
              {tax.data.map((x) => (
                <li key={x.tax_rate_bp} className="rounded-xl border border-rule bg-paper p-4">
                  <p className="font-bold">{plural(language, x.bills, r.rateOnBills, { rate: x.tax_rate_bp / 100 })}</p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-4 text-sm">
                    <dt className="text-slate">{r.valueTaxed}</dt>
                    <dd className="text-right tabular-nums">{fmt(x.taxable_minor)}</dd>
                    {gst ? (
                      <>
                        <dt className="text-slate">{m.invoice.cgst}</dt>
                        <dd className="text-right tabular-nums">{fmt(x.cgst_minor)}</dd>
                        <dt className="text-slate">{m.invoice.sgst}</dt>
                        <dd className="text-right tabular-nums">{fmt(x.sgst_minor)}</dd>
                        <dt className="text-slate">{m.invoice.igst}</dt>
                        <dd className="text-right tabular-nums">{fmt(x.igst_minor)}</dd>
                      </>
                    ) : null}
                    <dt className="font-semibold">{gst ? m.labels.gst : label}</dt>
                    <dd className="text-right font-semibold tabular-nums">{fmt(x.tax_minor)}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-slate">{fill(r.taxNote, { month: name })}</p>
        </Section>
      ) : null}

      <Section title={r.extrasTitle}>
        {extras.data.length === 0 ? (
          <Empty>{fill(r.noExtras, { month: name })}</Empty>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {extras.data.map((x) => (
              <li key={x.name} className="flex min-h-12 flex-wrap items-center gap-x-3 px-4 py-2">
                <span className="flex-1 font-semibold">{x.name}</span>
                <span className="text-slate">{plural(language, x.stays, r.onStays)}</span>
                <span className="tabular-nums">{fmt(x.amount_minor)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-slate">{fill(r.extrasNote, { month: name })}</p>
      </Section>

      <Section title={r.downloadTitle}>
        <form action="/app/more/reports/download" method="get" className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <Field label={r.what}>
            <Select name="what" defaultValue="bills">
              {DOWNLOADS.map((key) => (
                <option key={key} value={key}>
                  {m.downloads.kinds[key]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label={r.from}>
              <Input name="from" type="date" required defaultValue={first} />
            </Field>
            <Field label={r.to}>
              <Input name="to" type="date" required defaultValue={last} />
            </Field>
          </div>
          <p className="text-sm text-slate">{r.downloadNote}</p>
          <button type="submit" className={buttonStyles.primary}>
            {r.download}
          </button>
        </form>
      </Section>

      <p>
        <Link href="/app/more/history" className="font-semibold underline underline-offset-4">
          {r.seeHistory}
        </Link>
      </p>
    </>
  );
}
