import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { InvoiceView } from "@/components/invoice-view";
import { PrintButton } from "@/components/print-button";
import { Rich } from "@/components/rich";
import { Badge, buttonStyles, Loading } from "@/components/ui";
import { formatDate, formatMoney, GST_STATES, qrMatrix, qrSvgPath, upiLink, type ISODate } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { parentI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

interface PublicLine {
  description: string;
  sac_code: string | null;
  quantity: number;
  unit_price_minor: number;
  discount_minor: number;
  taxable_minor: number;
  tax_rate_bp: number;
  cgst_minor: number;
  sgst_minor: number;
  igst_minor: number;
  tax_minor: number;
  total_minor: number;
}

interface PublicInvoice {
  /** The kennel's language for parents. */
  language: string;
  /** The kennel's locale, such as en-IN: its region formats amounts and dates. */
  locale: string | null;
  number: string;
  status: "issued" | "void";
  issued_on: ISODate;
  is_tax_invoice: boolean;
  currency: string;
  seller: {
    name: string;
    trade_name: string | null;
    address_line1: string | null;
    address_line2: string | null;
    city: string | null;
    state: string | null;
    postal_code: string | null;
    phone: string | null;
    email: string | null;
    tax_mode: string;
    tax_label: string | null;
    tax_id: string | null;
    gst_state_code: string | null;
  };
  buyer: { name: string; phone: string | null; address: string | null; city: string | null; postal_code: string | null; tax_id: string | null };
  place_of_supply_state_code: string | null;
  subtotal_minor: number;
  discount_minor: number;
  taxable_minor: number;
  cgst_minor: number;
  sgst_minor: number;
  igst_minor: number;
  tax_minor: number;
  round_off_minor: number;
  total_minor: number;
  paid_minor: number;
  notes: string | null;
  upi: { vpa: string; payee_name: string } | null;
  lines: PublicLine[];
}

/** The bill for a link, read once per request (the title and the page share it). Null when there is no such bill. */
const loadInvoice = cache(async (token: string): Promise<PublicInvoice | null> => {
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await createAnonClient().rpc("get_public_invoice", { p_token: token });
  if (error || !data) return null;
  return data as unknown as PublicInvoice;
});

/** The tab title in the kennel's language for parents. */
export async function generateMetadata({ params }: PageProps<"/inv/[token]">): Promise<Metadata> {
  const inv = await loadInvoice((await params).token);
  return { title: parentI18n(inv?.language).m.invoice.title, robots: { index: false } };
}

/** The bill a parent opens from the link the kennel sent them. No sign-in. Prints as a clean A4 invoice. */
export default function PublicInvoicePage({ params }: PageProps<"/inv/[token]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8 print:max-w-none print:p-0">
      <Suspense fallback={<Loading />}>
        <Invoice params={params} />
      </Suspense>
    </main>
  );
}

const lines = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(", ");

async function Invoice({ params }: Pick<PageProps<"/inv/[token]">, "params">) {
  const { token } = await params;
  const inv = await loadInvoice(token);
  if (!inv) notFound();
  // In the kennel's language for parents, with amounts and dates in the kennel's region.
  const { m, locale } = parentI18n(inv.language, inv.locale);
  const w = m.invoice;

  const money = (minor: number) => formatMoney(minor, { currency: inv.currency, locale });
  const due = inv.status === "issued" ? inv.total_minor - Number(inv.paid_minor) : 0;
  const gst = inv.seller.tax_mode === "gst_india";
  const stateName = (code: string | null) => (code ? fill(w.stateWithCode, { state: GST_STATES[code] ?? w.unknownState, code }) : null);

  // A pay link and QR code for what is still owed, to the UPI ID frozen on the bill.
  let pay: { link: string; qr: { d: string; size: number } } | null = null;
  if (inv.upi && due > 0 && inv.currency === "INR") {
    try {
      const link = upiLink({ vpa: inv.upi.vpa, payeeName: inv.upi.payee_name, amountMinor: due, note: inv.number, reference: inv.number });
      pay = { link, qr: qrSvgPath(qrMatrix(link)) };
    } catch {
      pay = null;
    }
  }

  const sellerTaxId = inv.seller.tax_id ? <span className="font-semibold">{inv.seller.tax_id}</span> : null;

  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-extrabold tracking-tight">{inv.seller.trade_name ?? inv.seller.name}</p>
          {inv.seller.trade_name && inv.seller.trade_name !== inv.seller.name ? <p>{inv.seller.name}</p> : null}
          <p className="text-slate">{lines(inv.seller.address_line1, inv.seller.address_line2, inv.seller.city, inv.seller.state, inv.seller.postal_code)}</p>
          <p className="text-slate">{lines(inv.seller.phone, inv.seller.email)}</p>
          {inv.is_tax_invoice && sellerTaxId ? (
            <p>
              <Rich
                text={gst ? (inv.seller.gst_state_code ? w.sellerGstinState : w.sellerGstin) : w.sellerTaxNumber}
                parts={{ id: sellerTaxId, state: stateName(inv.seller.gst_state_code) }}
              />
            </p>
          ) : null}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-extrabold tracking-tight">{inv.is_tax_invoice ? w.taxInvoice : w.bill}</h1>
          <p className="font-semibold">{inv.number}</p>
          <p className="text-slate">{formatDate(inv.issued_on, locale)}</p>
        </div>
      </header>

      {inv.status === "void" ? (
        <p role="status" className="rounded-lg border-2 border-alert bg-alert-soft px-4 py-3 font-bold text-alert">
          {w.cancelled}
        </p>
      ) : null}

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="font-bold">{w.billedTo}</h2>
          <p>{inv.buyer.name}</p>
          <p className="text-slate">{lines(inv.buyer.address, inv.buyer.city, inv.buyer.postal_code)}</p>
          <p className="text-slate">{inv.buyer.phone}</p>
          {inv.buyer.tax_id ? <p>{fill(w.buyerGstin, { id: inv.buyer.tax_id })}</p> : null}
        </div>
        {inv.is_tax_invoice && gst ? (
          <div>
            <h2 className="font-bold">{w.placeOfSupply}</h2>
            <p>{stateName(inv.place_of_supply_state_code)}</p>
          </div>
        ) : null}
      </section>

      <InvoiceView
        words={m}
        lines={inv.lines.map((l) => ({
          description: l.description,
          sacCode: l.sac_code,
          quantity: Number(l.quantity),
          unitPriceMinor: l.unit_price_minor,
          discountMinor: l.discount_minor,
          taxableMinor: l.taxable_minor,
          taxRateBp: l.tax_rate_bp,
          cgstMinor: l.cgst_minor,
          sgstMinor: l.sgst_minor,
          igstMinor: l.igst_minor,
          taxMinor: l.tax_minor,
          totalMinor: l.total_minor,
        }))}
        totals={{
          subtotalMinor: inv.subtotal_minor,
          discountMinor: inv.discount_minor,
          taxableMinor: inv.taxable_minor,
          cgstMinor: inv.cgst_minor,
          sgstMinor: inv.sgst_minor,
          igstMinor: inv.igst_minor,
          taxMinor: inv.tax_minor,
          roundOffMinor: inv.round_off_minor,
          totalMinor: inv.total_minor,
        }}
        currency={inv.currency}
        locale={locale}
        taxMode={inv.seller.tax_mode}
        taxLabel={inv.seller.tax_label}
        showTax={inv.is_tax_invoice}
      />

      {inv.status === "issued" ? (
        <section className="rounded-xl border border-rule bg-paper px-4 py-3">
          <p className="flex flex-wrap items-center justify-between gap-2 text-lg">
            <span>{fill(w.paid, { amount: money(Number(inv.paid_minor)) })}</span>
            {due > 0 ? <Badge tone="attention">{fill(w.due, { amount: money(due) })}</Badge> : <Badge tone="good">{w.paidInFull}</Badge>}
          </p>
        </section>
      ) : null}

      {pay ? (
        <section className="flex flex-col items-center gap-3 rounded-xl border border-rule bg-paper p-4 text-center">
          <h2 className="text-lg font-bold">{fill(w.payByUpi, { amount: money(due) })}</h2>
          <a href={pay.link} className={`${buttonStyles.primary} no-print w-full sm:hidden`}>
            {w.payWithUpi}
          </a>
          <svg
            role="img"
            aria-label={fill(w.qrLabel, { amount: money(due) })}
            viewBox={`0 0 ${pay.qr.size} ${pay.qr.size}`}
            className="h-56 w-56 text-ink"
            shapeRendering="crispEdges"
          >
            <rect width={pay.qr.size} height={pay.qr.size} fill="var(--color-paper)" />
            <path d={pay.qr.d} fill="currentColor" />
          </svg>
          <p className="text-sm text-slate">{fill(w.scanHint, { payee: inv.upi?.payee_name ?? "", vpa: inv.upi?.vpa ?? "" })}</p>
        </section>
      ) : null}

      {inv.notes ? <p className="whitespace-pre-line text-slate">{inv.notes}</p> : null}

      <div className="flex flex-wrap gap-2">
        <PrintButton label={m.common.print} />
      </div>
    </article>
  );
}
