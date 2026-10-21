import Link from "next/link";
import { Suspense } from "react";
import { Rich } from "@/components/rich";
import { Badge, Empty, Loading, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { BILLABLE_IN_FAMILY } from "@/lib/billing";
import { formatDate, formatMoney } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.bills.title);

export default function BillsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Bills />
    </Suspense>
  );
}

async function Bills() {
  const { org } = await requireOrg();
  const { m, language, locale } = await getAppI18n();
  const supabase = await createClient();
  const [invoices, balances] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, status, number, issued_on, created_at, total_minor, group_id, series_id, series_month, clients(full_name), bookings(pets(name))")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("invoice_balances").select("invoice_id, paid_minor, due_minor").eq("org_id", org.id).limit(5000),
  ]);
  if (invoices.error || balances.error) throw new Error("Could not load bills.");

  // A family's bill names every pet on it.
  const groups = [...new Set(invoices.data.flatMap((i) => (i.group_id ? [i.group_id] : [])))];
  // A month of a repeating series (D41) names its pet and its month.
  const seriesIds = [...new Set(invoices.data.flatMap((i) => (i.series_id ? [i.series_id] : [])))];
  const [familyPets, seriesPets] = await Promise.all([
    groups.length
      ? supabase.from("bookings").select("group_id, pets(name)").eq("org_id", org.id).in("group_id", groups).in("status", [...BILLABLE_IN_FAMILY]).order("created_at")
      : Promise.resolve({ data: [], error: null }),
    seriesIds.length
      ? supabase.from("bookings").select("series_id, pets(name)").eq("org_id", org.id).in("series_id", seriesIds).limit(seriesIds.length * 40)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (familyPets.error || seriesPets.error) throw new Error("Could not load bills.");
  const petsOf = (i: (typeof invoices.data)[number]) =>
    i.group_id
      ? familyPets.data.filter((b) => b.group_id === i.group_id).map((b) => b.pets?.name).filter(Boolean).join(", ")
      : i.series_id && i.series_month
        ? fill(m.bills.seriesMonth, {
            pet: seriesPets.data.find((b) => b.series_id === i.series_id)?.pets?.name ?? "",
            month: new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${i.series_month}T00:00:00Z`)),
          })
        : (i.bookings?.pets?.name ?? "");

  const due = new Map(balances.data.map((b) => [b.invoice_id, b.due_minor ?? 0]));
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const unpaid = invoices.data.filter((i) => i.status === "issued" && (due.get(i.id) ?? 0) > 0);
  const drafts = invoices.data.filter((i) => i.status === "draft");
  const rest = invoices.data.filter((i) => !unpaid.includes(i) && !drafts.includes(i)).slice(0, 100);
  const owed = unpaid.reduce((n, i) => n + (due.get(i.id) ?? 0), 0);

  const row = (i: (typeof invoices.data)[number]) => {
    const d = due.get(i.id) ?? 0;
    return (
      <li key={i.id}>
        <Link href={`/app/bills/${i.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-ground">
          <span className="font-bold">{i.number ?? m.labels.invoiceStatus.draft}</span>
          {i.status === "void" ? <Badge tone="alert">{m.labels.invoiceStatus.void}</Badge> : null}
          {i.status === "issued" && d <= 0 ? <Badge tone="good">{m.bills.paid}</Badge> : null}
          {i.status === "issued" && d > 0 ? <Badge tone="attention">{fill(m.bills.due, { amount: money(d) })}</Badge> : null}
          <span className="ml-auto tabular-nums text-slate">{money(i.total_minor)}</span>
          {/* On its own line, so a long name or a month of a series never runs under the badges on a phone. */}
          <span className="w-full">
            {i.clients?.full_name}
            {petsOf(i) ? `, ${petsOf(i)}` : ""}
          </span>
          <span className="w-full text-sm text-slate">
            {i.issued_on ? formatDate(i.issued_on, locale) : fill(m.bills.started, { date: formatDate(i.created_at.slice(0, 10), locale) })}
          </span>
        </Link>
      </li>
    );
  };
  const list = (rows: typeof invoices.data) => <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">{rows.map(row)}</ul>;

  return (
    <>
      <PageTitle title={m.bills.title} />
      <p className="mb-5 text-lg">
        {unpaid.length === 0 ? (
          m.bills.nothingOwed
        ) : (
          <Rich text={plural(language, unpaid.length, m.bills.owedOn)} parts={{ amount: <strong className="font-extrabold">{money(owed)}</strong> }} />
        )}
      </p>
      {invoices.data.length === 0 ? <Empty>{m.bills.none}</Empty> : null}
      {unpaid.length > 0 ? (
        <Section title={m.bills.notPaid} count={unpaid.length}>
          {list(unpaid)}
        </Section>
      ) : null}
      {drafts.length > 0 ? (
        <Section title={m.bills.drafts} count={drafts.length}>
          {list(drafts)}
        </Section>
      ) : null}
      {rest.length > 0 ? <Section title={m.bills.recent}>{list(rest)}</Section> : null}
    </>
  );
}
