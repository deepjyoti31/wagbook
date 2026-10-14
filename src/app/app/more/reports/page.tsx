import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Suspense } from "react";
import { MonthPicker } from "@/components/month-picker";
import { OccupancyChart } from "@/components/occupancy-chart";
import { buttonStyles, Empty, Field, Input, Loading, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { taxLabel } from "@/lib/billing";
import { formatDate, formatMoney, isYearMonth, monthBounds, monthName, shiftMonth, shortMonthName, summariseOccupancy, todayIn } from "@/lib/core";
import { DOWNLOADS } from "@/lib/reports";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Reports" };

export default function ReportsPage({ searchParams }: PageProps<"/app/more/reports">) {
  return (
    <>
      <PageTitle title="Reports" />
      <Suspense fallback={<Loading label="Adding up" />}>
        <Reports searchParams={searchParams} />
      </Suspense>
    </>
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
  if (!canManage) return <Empty>Reports are for owners and managers.</Empty>;

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

  const fmt = (minor: number) => formatMoney(minor, { currency: org.currency, locale: org.locale, trimZeros: true });
  const days = occupancy.data.map((d) => ({ day: d.day, boarding: d.boarding, dayBoarding: d.day_boarding, capacity: d.capacity }));
  const stay = summariseOccupancy(days);
  const thisMonth = money.data.find((m) => m.month.slice(0, 7) === month);
  const owedTotal = owed.data.reduce((n, b) => n + (b.due_minor ?? 0), 0);
  const charged = org.tax_mode !== "none" || tax.data.some((t) => t.tax_minor > 0);
  const gst = org.tax_mode === "gst_india";
  const label = taxLabel(org.tax_mode, org.tax_label);
  const taxWord = gst ? "GST" : label === "Tax" ? "tax" : label;
  const net = thisMonth ? thisMonth.received_minor - thisMonth.refunded_minor - thisMonth.spent_minor : 0;
  const name = monthName(month, org.locale);

  return (
    <>
      <MonthPicker month={month} href={(m) => `/app/more/reports?month=${m}`} locale={org.locale} />

      <Section title="How full">
        <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Figure label="Nights sold">{stay.nights}</Figure>
          <Figure label="Day boarding days">{stay.days}</Figure>
          <Figure label="Kennels used">{stay.percentFull === null ? "No kennels" : `${stay.percentFull}%`}</Figure>
          <Figure label="Busiest day" hint={stay.busiest ? `${stay.busiest.pets} ${stay.busiest.pets === 1 ? "pet" : "pets"}` : undefined}>
            {stay.busiest ? formatDate(stay.busiest.day, org.locale).replace(/ \d{4}$/, "") : "None"}
          </Figure>
        </div>
        <OccupancyChart days={days} locale={org.locale} />
        <p className="mt-2 text-sm text-slate">
          Counts confirmed, current and finished stays; not requests, cancellations or no-shows. Kennels are the ones in service today.
        </p>
      </Section>

      <Section title={`Money in ${name}`}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Figure label="Billed" hint={charged && thisMonth ? `Includes ${fmt(thisMonth.tax_minor)} ${taxWord}` : undefined}>
            {fmt(thisMonth?.billed_minor ?? 0)}
          </Figure>
          <Figure label="Received">{fmt(thisMonth?.received_minor ?? 0)}</Figure>
          {thisMonth && thisMonth.refunded_minor > 0 ? <Figure label="Refunded">{fmt(thisMonth.refunded_minor)}</Figure> : null}
          <Figure label="Spent">{fmt(thisMonth?.spent_minor ?? 0)}</Figure>
          <Figure label="Received less spent">{fmt(net)}</Figure>
        </div>
        <p className="mt-3">
          {owed.data.length === 0 ? (
            "Nothing is owed on bills today."
          ) : (
            <>
              Owed today: <strong className="font-extrabold">{fmt(owedTotal)}</strong> on {owed.data.length} {owed.data.length === 1 ? "bill" : "bills"}.{" "}
              <Link href="/app/bills" className="font-semibold underline underline-offset-4">
                See bills
              </Link>
            </>
          )}
        </p>
        <p className="mt-1">
          <Link href={`/app/more/expenses?month=${month}`} className="font-semibold underline underline-offset-4">
            See and add expenses
          </Link>
        </p>
      </Section>

      <Section title="Month by month">
        <div className="relative overflow-x-auto rounded-xl border border-rule bg-paper">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-rule text-slate">
                <th className="px-3 py-2 font-semibold">Month</th>
                <th className="px-2 py-2 text-right font-semibold">Billed</th>
                <th className="px-2 py-2 text-right font-semibold">Received</th>
                <th className="px-2 py-2 text-right font-semibold">Spent</th>
              </tr>
            </thead>
            <tbody>
              {[...money.data].reverse().map((m) => (
                <tr key={m.month} className="border-b border-rule last:border-0">
                  <th scope="row" className="whitespace-nowrap px-3 py-2 font-semibold">
                    <Link href={`/app/more/reports?month=${m.month.slice(0, 7)}`} className="underline underline-offset-4">
                      {shortMonthName(m.month.slice(0, 7), org.locale)} {m.month.slice(2, 4)}
                    </Link>
                  </th>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{fmt(m.billed_minor)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{fmt(m.received_minor - m.refunded_minor)}</td>
                  <td className="whitespace-nowrap px-2 py-2 text-right tabular-nums">{fmt(m.spent_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-sm text-slate">Billed counts issued bills by bill date, leaving out cancelled ones. Received is after refunds.</p>
      </Section>

      {charged ? (
        <Section title={`${label} by rate`}>
          {tax.data.length === 0 ? (
            <Empty>No bills issued in {name}.</Empty>
          ) : (
            <ul className="space-y-2">
              {tax.data.map((t) => (
                <li key={t.tax_rate_bp} className="rounded-xl border border-rule bg-paper p-4">
                  <p className="font-bold">
                    {t.tax_rate_bp / 100}% on {t.bills} {t.bills === 1 ? "bill" : "bills"}
                  </p>
                  <dl className="mt-1 grid grid-cols-2 gap-x-4 text-sm">
                    <dt className="text-slate">Value taxed</dt>
                    <dd className="text-right tabular-nums">{fmt(t.taxable_minor)}</dd>
                    {gst ? (
                      <>
                        <dt className="text-slate">CGST</dt>
                        <dd className="text-right tabular-nums">{fmt(t.cgst_minor)}</dd>
                        <dt className="text-slate">SGST</dt>
                        <dd className="text-right tabular-nums">{fmt(t.sgst_minor)}</dd>
                        <dt className="text-slate">IGST</dt>
                        <dd className="text-right tabular-nums">{fmt(t.igst_minor)}</dd>
                      </>
                    ) : null}
                    <dt className="font-semibold">{gst ? "GST" : label}</dt>
                    <dd className="text-right font-semibold tabular-nums">{fmt(t.tax_minor)}</dd>
                  </dl>
                </li>
              ))}
            </ul>
          )}
          <p className="mt-2 text-sm text-slate">From issued bills dated in {name}. Cancelled bills are left out. Check returns with your accountant.</p>
        </Section>
      ) : null}

      <Section title="Extras that sell">
        {extras.data.length === 0 ? (
          <Empty>No extras on stays starting in {name}.</Empty>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {extras.data.map((x) => (
              <li key={x.name} className="flex min-h-12 flex-wrap items-center gap-x-3 px-4 py-2">
                <span className="flex-1 font-semibold">{x.name}</span>
                <span className="text-slate">
                  on {x.stays} {x.stays === 1 ? "stay" : "stays"}
                </span>
                <span className="tabular-nums">{fmt(x.amount_minor)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-2 text-sm text-slate">On stays starting in {name}, at the price charged before discount and tax.</p>
      </Section>

      <Section title="Download for a spreadsheet">
        <form action="/app/more/reports/download" method="get" className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <Field label="What">
            <Select name="what" defaultValue="bills">
              {Object.entries(DOWNLOADS).map(([key, title]) => (
                <option key={key} value={key}>
                  {title}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="From">
              <Input name="from" type="date" required defaultValue={first} />
            </Field>
            <Field label="To">
              <Input name="to" type="date" required defaultValue={last} />
            </Field>
          </div>
          <p className="text-sm text-slate">A CSV file, which Excel, Google Sheets and your accountant can open. Up to 400 days at a time.</p>
          <button type="submit" className={buttonStyles.primary}>
            Download
          </button>
        </form>
      </Section>

      <p>
        <Link href="/app/more/history" className="font-semibold underline underline-offset-4">
          See the history of changes
        </Link>
      </p>
    </>
  );
}
