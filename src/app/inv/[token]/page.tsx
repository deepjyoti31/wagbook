import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { InvoiceRow, InvoiceView } from "@/components/invoice-view";
import { PrintButton } from "@/components/print-button";
import { Rich } from "@/components/rich";
import { buttonStyles, Loading } from "@/components/ui";
import { formatDate, formatMoney, formatPhone, GST_STATES, qrMatrix, qrSvgPath, upiLink, type ISODate } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { billWords } from "@/lib/bill-words";
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

interface PublicCreditNote {
  number: string;
  issued_on: ISODate;
  reason: string;
  subtotal_minor: number;
  discount_minor: number;
  taxable_minor: number;
  cgst_minor: number;
  sgst_minor: number;
  igst_minor: number;
  tax_minor: number;
  round_off_minor: number;
  total_minor: number;
  lines: PublicLine[];
}

interface PublicInvoice {
  /** The language the parent asked for alongside English (hi or kn), or null. */
  translation: string | null;
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
  credit_notes: PublicCreditNote[];
}

/** The bill for a link, read once per request (the title and the page share it). Null when there is no such bill. */
const loadInvoice = cache(async (token: string): Promise<PublicInvoice | null> => {
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await createAnonClient().rpc("get_public_invoice", { p_token: token });
  if (error || !data) return null;
  return data as unknown as PublicInvoice;
});

/** The tab title: English, with the parent's language in brackets if they asked for it. */
export async function generateMetadata({ params }: PageProps<"/inv/[token]">): Promise<Metadata> {
  const inv = await loadInvoice((await params).token);
  return { title: billWords(inv?.translation).invoice.title, robots: { index: false } };
}

/** The bill a parent opens from the link the kennel sent them. No sign-in. Prints as a clean A4 invoice. */
export default function PublicInvoicePage({ params, searchParams }: PageProps<"/inv/[token]">) {
  return (
    <main className="wb-parent mx-auto w-full max-w-2xl flex-1 px-4 py-8 print:max-w-none print:p-0">
      <Suspense fallback={<Loading />}>
        <Invoice params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const lines = (...parts: (string | null | undefined)[]) => parts.filter((p) => p && p.trim()).join(", ");

const viewLines = (lines: PublicLine[]) =>
  lines.map((l) => ({
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
  }));

const viewTotals = (d: Omit<PublicCreditNote, "number" | "issued_on" | "reason" | "lines">) => ({
  subtotalMinor: d.subtotal_minor,
  discountMinor: d.discount_minor,
  taxableMinor: d.taxable_minor,
  cgstMinor: d.cgst_minor,
  sgstMinor: d.sgst_minor,
  igstMinor: d.igst_minor,
  taxMinor: d.tax_minor,
  roundOffMinor: d.round_off_minor,
  totalMinor: d.total_minor,
});

async function Invoice({ params, searchParams }: Pick<PageProps<"/inv/[token]">, "params" | "searchParams">) {
  const { token } = await params;
  const cn = (await searchParams).cn;
  const inv = await loadInvoice(token);
  if (!inv) notFound();
  const note = typeof cn === "string" ? (inv.credit_notes ?? []).find((c) => c.number === cn) : undefined;
  if (note) return <CreditNote inv={inv} note={note} />;
  // In English, with the headings in the parent's language too if they asked (D31); amounts and dates in the kennel's region.
  const m = billWords(inv.translation);
  const { locale } = parentI18n("en", inv.locale);
  const w = m.invoice;

  const money = (minor: number) => formatMoney(minor, { currency: inv.currency, locale });
  const credited = (inv.credit_notes ?? []).reduce((sum, c) => sum + c.total_minor, 0);
  const due = inv.status === "issued" ? inv.total_minor - credited - Number(inv.paid_minor) : 0;
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
    // A white sheet on the parent's page; on paper, just the page.
    <article className="flex flex-col gap-[26px] rounded-3xl border border-rule bg-paper p-5 sm:px-[60px] sm:py-14 print:min-h-[calc(297mm-28mm)] print:rounded-none print:border-0 print:p-0">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4 border-b-[3px] border-marigold pb-5">
        <div className="flex flex-col gap-[3px] text-[13px]">
          <p className="text-2xl font-extrabold tracking-[-0.01em]">{inv.seller.trade_name ?? inv.seller.name}</p>
          {inv.seller.trade_name && inv.seller.trade_name !== inv.seller.name ? <p>{inv.seller.name}</p> : null}
          <p className="text-[#4a5468]">{lines(inv.seller.address_line1, inv.seller.address_line2, inv.seller.city, inv.seller.state, inv.seller.postal_code)}</p>
          <p className="text-[#4a5468]">{[inv.seller.phone ? formatPhone(inv.seller.phone) : null, inv.seller.email].filter(Boolean).join(" · ")}</p>
          {inv.is_tax_invoice && sellerTaxId ? (
            <p>
              <Rich
                text={gst ? (inv.seller.gst_state_code ? w.sellerGstinState : w.sellerGstin) : w.sellerTaxNumber}
                parts={{ id: sellerTaxId, state: stateName(inv.seller.gst_state_code) }}
              />
            </p>
          ) : null}
        </div>
        <div className="flex flex-col gap-[3px] text-right text-sm">
          <h1 className="text-[26px] font-extrabold leading-tight tracking-[-0.01em]">{inv.is_tax_invoice ? w.taxInvoice : w.bill}</h1>
          <p>
            <Rich text={w.billNumber} parts={{ number: <strong>{inv.number}</strong> }} />
          </p>
          <p>{formatDate(inv.issued_on, locale)}</p>
        </div>
      </header>

      {inv.status === "void" ? (
        <p role="status" className="rounded-lg border-2 border-alert bg-alert-soft px-4 py-3 font-bold text-alert">
          {w.cancelled}
        </p>
      ) : null}

      <section className="grid gap-5 sm:grid-cols-3">
        <div className="flex flex-col gap-[3px] text-[13px] sm:col-span-2">
          <h2 className="text-xs font-bold text-[#4a5468]">{w.billedTo}</h2>
          <p className="text-[15px] font-bold">{inv.buyer.name}</p>
          <p className="text-[#4a5468]">{inv.buyer.phone ? formatPhone(inv.buyer.phone) : null}</p>
          <p className="text-[#4a5468]">{lines(inv.buyer.address, inv.buyer.city, inv.buyer.postal_code)}</p>
          {inv.buyer.tax_id ? <p>{fill(w.buyerGstin, { id: inv.buyer.tax_id })}</p> : null}
        </div>
        {inv.is_tax_invoice && gst ? (
          <div className="flex flex-col gap-[3px]">
            <h2 className="text-xs font-bold text-[#4a5468]">{w.placeOfSupply}</h2>
            <p className="text-[15px] font-bold">{stateName(inv.place_of_supply_state_code)}</p>
          </div>
        ) : null}
      </section>

      <InvoiceView
        words={m}
        lines={viewLines(inv.lines)}
        totals={viewTotals(inv)}
        currency={inv.currency}
        locale={locale}
        taxMode={inv.seller.tax_mode}
        taxLabel={inv.seller.tax_label}
        showTax={inv.is_tax_invoice}
        beside={
          pay ? (
            // To pay by: the code to scan on paper and a laptop, and a button on a phone.
            <section className="flex flex-wrap gap-4 rounded-[10px] border-[1.5px] border-ink p-4">
              <svg
                role="img"
                aria-label={fill(w.qrLabel, { amount: money(due) })}
                viewBox={`0 0 ${pay.qr.size} ${pay.qr.size}`}
                className="size-28 shrink-0 text-ink"
                shapeRendering="crispEdges"
              >
                <rect width={pay.qr.size} height={pay.qr.size} fill="var(--color-paper)" />
                <path d={pay.qr.d} fill="currentColor" />
              </svg>
              <div className="flex min-w-[150px] flex-1 flex-col gap-1.5">
                <h2 className="text-base font-extrabold">{fill(w.payByUpi, { amount: money(due) })}</h2>
                <p className="text-[13px] text-[#4a5468]">{fill(w.scanHint, { payee: inv.upi?.payee_name ?? "", vpa: inv.upi?.vpa ?? "" })}</p>
                <a href={pay.link} className={`${buttonStyles.primary} no-print mt-1 sm:hidden`}>
                  {w.payWithUpi}
                </a>
              </div>
            </section>
          ) : undefined
        }
        afterTotal={
          inv.status === "issued" ? (
            <>
              {credited > 0 ? <InvoiceRow label={w.creditedLabel} value={`- ${money(credited)}`} /> : null}
              <InvoiceRow label={w.paidLabel} value={money(Number(inv.paid_minor))} />
              {due > 0 ? (
                <div className="mt-1.5 flex justify-between gap-4 rounded-lg border-[1.5px] border-marigold bg-marigold-soft px-3 py-2.5 text-base font-extrabold">
                  <dt>{w.dueLabel}</dt>
                  <dd>{money(due)}</dd>
                </div>
              ) : (
                <p className="mt-1.5 rounded-lg border-[1.5px] border-leaf bg-leaf-soft px-3 py-2.5 text-base font-extrabold text-leaf-ink">{w.paidInFull}</p>
              )}
            </>
          ) : undefined
        }
      />

      {(inv.credit_notes ?? []).length > 0 ? (
        <section className="space-y-2">
          <h2 className="text-xs font-bold text-[#4a5468]">{w.creditNotes}</h2>
          <ul className="space-y-1">
            {inv.credit_notes.map((c) => (
              <li key={c.number}>
                <a href={`?cn=${encodeURIComponent(c.number)}`} className="inline-flex min-h-12 items-center underline underline-offset-4">
                  {fill(w.seeCreditNote, { number: c.number, amount: money(c.total_minor) })}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {inv.notes ? <p className="whitespace-pre-line text-[13px] text-[#4a5468]">{inv.notes}</p> : null}

      <div className="no-print flex flex-wrap gap-2">
        <PrintButton label={m.common.print} />
      </div>

      <footer className="mt-auto flex flex-wrap justify-between gap-x-6 gap-y-1 border-t border-[#c9cfda] pt-4 text-[13px] text-[#4a5468]">
        <span>{fill(w.thanks, { kennel: inv.seller.trade_name ?? inv.seller.name })}</span>
        <span>{fill(w.billNumber, { number: inv.number })}</span>
      </footer>
    </article>
  );
}

/** One credit note against the bill, as its own document: printable like the bill. */
function CreditNote({ inv, note }: { inv: PublicInvoice; note: PublicCreditNote }) {
  const m = billWords(inv.translation);
  const { locale } = parentI18n("en", inv.locale);
  const w = m.invoice;
  return (
    <article className="space-y-6">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-2xl font-extrabold tracking-tight">{inv.seller.trade_name ?? inv.seller.name}</p>
          {inv.seller.trade_name && inv.seller.trade_name !== inv.seller.name ? <p>{inv.seller.name}</p> : null}
          <p className="text-slate">{lines(inv.seller.address_line1, inv.seller.address_line2, inv.seller.city, inv.seller.state, inv.seller.postal_code)}</p>
          {inv.is_tax_invoice && inv.seller.tax_id ? <p className="font-semibold">{inv.seller.tax_id}</p> : null}
        </div>
        <div className="text-right">
          <h1 className="text-2xl font-extrabold tracking-tight">{w.creditNote}</h1>
          <p className="font-semibold">{note.number}</p>
          <p className="text-slate">{formatDate(note.issued_on, locale)}</p>
        </div>
      </header>

      <section className="grid gap-4 sm:grid-cols-2">
        <div>
          <h2 className="font-bold">{w.billedTo}</h2>
          <p>{inv.buyer.name}</p>
          <p className="text-slate">{lines(inv.buyer.address, inv.buyer.city, inv.buyer.postal_code)}</p>
          {inv.buyer.tax_id ? <p>{fill(w.buyerGstin, { id: inv.buyer.tax_id })}</p> : null}
        </div>
        <div>
          <p className="font-semibold">{fill(w.againstBill, { number: inv.number, date: formatDate(inv.issued_on, locale) })}</p>
          <p className="text-slate">{fill(w.reason, { reason: note.reason })}</p>
        </div>
      </section>

      <InvoiceView
        words={m}
        lines={viewLines(note.lines)}
        totals={viewTotals(note)}
        currency={inv.currency}
        locale={locale}
        taxMode={inv.seller.tax_mode}
        taxLabel={inv.seller.tax_label}
        showTax={inv.is_tax_invoice}
      />

      <div className="no-print flex flex-wrap gap-2">
        <PrintButton label={m.common.print} />
        <a href="?" className={buttonStyles.quiet}>
          {w.backToBill}
        </a>
      </div>
    </article>
  );
}
