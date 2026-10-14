import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, Empty, Loading, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { INVOICE_STATUS_LABEL } from "@/lib/billing";
import { formatDate, formatMoney } from "@/lib/core";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bills" };

export default function BillsPage() {
  return (
    <>
      <PageTitle title="Bills" />
      <Suspense fallback={<Loading label="Loading bills" />}>
        <Bills />
      </Suspense>
    </>
  );
}

async function Bills() {
  const { org } = await requireOrg();
  const supabase = await createClient();
  const [invoices, balances] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, status, number, issued_on, created_at, total_minor, clients(full_name), bookings(pets(name))")
      .eq("org_id", org.id)
      .order("created_at", { ascending: false })
      .limit(300),
    supabase.from("invoice_balances").select("invoice_id, paid_minor, due_minor").eq("org_id", org.id).limit(5000),
  ]);
  if (invoices.error || balances.error) throw new Error("Could not load bills.");

  const due = new Map(balances.data.map((b) => [b.invoice_id, b.due_minor ?? 0]));
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale: org.locale, trimZeros: true });
  const unpaid = invoices.data.filter((i) => i.status === "issued" && (due.get(i.id) ?? 0) > 0);
  const drafts = invoices.data.filter((i) => i.status === "draft");
  const rest = invoices.data.filter((i) => !unpaid.includes(i) && !drafts.includes(i)).slice(0, 100);
  const owed = unpaid.reduce((n, i) => n + (due.get(i.id) ?? 0), 0);

  const row = (i: (typeof invoices.data)[number]) => {
    const d = due.get(i.id) ?? 0;
    return (
      <li key={i.id}>
        <Link href={`/app/bills/${i.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-ground">
          <span className="font-bold">{i.number ?? "Draft"}</span>
          <span className="min-w-0 flex-1">
            {i.clients?.full_name}
            {i.bookings?.pets?.name ? `, ${i.bookings.pets.name}` : ""}
          </span>
          {i.status === "void" ? <Badge tone="alert">{INVOICE_STATUS_LABEL.void}</Badge> : null}
          {i.status === "issued" && d <= 0 ? <Badge tone="good">Paid</Badge> : null}
          {i.status === "issued" && d > 0 ? <Badge tone="attention">{money(d)} due</Badge> : null}
          <span className="tabular-nums text-slate">{money(i.total_minor)}</span>
          <span className="w-full text-sm text-slate">{i.issued_on ? formatDate(i.issued_on) : `Started ${formatDate(i.created_at.slice(0, 10))}`}</span>
        </Link>
      </li>
    );
  };
  const list = (rows: typeof invoices.data) => <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">{rows.map(row)}</ul>;

  return (
    <>
      <p className="mb-5 text-lg">
        {unpaid.length === 0 ? (
          "Nothing is owed."
        ) : (
          <>
            <strong className="font-extrabold">{money(owed)}</strong> owed on {unpaid.length} {unpaid.length === 1 ? "bill" : "bills"}.
          </>
        )}
      </p>
      {invoices.data.length === 0 ? <Empty>No bills yet. Make one from a booking, usually at check-out.</Empty> : null}
      {unpaid.length > 0 ? <Section title="Not paid yet" count={unpaid.length}>{list(unpaid)}</Section> : null}
      {drafts.length > 0 ? <Section title="Drafts" count={drafts.length}>{list(drafts)}</Section> : null}
      {rest.length > 0 ? <Section title="Recent">{list(rest)}</Section> : null}
    </>
  );
}
