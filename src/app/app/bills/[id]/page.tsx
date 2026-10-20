import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { CopyButton } from "@/components/copy-button";
import { InvoiceView } from "@/components/invoice-view";
import { PaymentForm } from "@/components/payment-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { BILLABLE_IN_FAMILY } from "@/lib/billing";
import { billMessage, formatDate, formatMoney, formatPhone, todayIn, toDecimalString, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n } from "@/lib/i18n-server";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import type { Messages } from "@/messages";
import { deleteDraft, editLine, issueBill, makeBill, voidBill } from "../actions";

export const generateMetadata = () => appTitle((m) => m.bill.title);

export default function BillPage({ params, searchParams }: PageProps<"/app/bills/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Bill params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Bill({ params, searchParams }: Pick<PageProps<"/app/bills/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const doneKey = (await searchParams).done;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage, canDelete } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const done = typeof doneKey === "string" && doneKey in m.bill.done ? m.bill.done[doneKey as keyof typeof m.bill.done] : undefined;
  const supabase = await createClient();

  const res = await supabase
    .from("invoices")
    .select(
      "id, status, number, issued_on, is_tax_invoice, currency, booking_id, group_id, public_token, void_reason, notes, subtotal_minor, discount_minor, taxable_minor, cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor, clients(full_name, phone), bookings(id, pets(name))",
    )
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (res.error) throw new Error("Could not load the bill.");
  if (!res.data) notFound();
  const inv = res.data;

  const [lines, payments, balance, family, origin] = await Promise.all([
    supabase
      .from("invoice_lines")
      .select("description, sac_code, quantity, unit_price_minor, discount_minor, taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, igst_minor, tax_minor, total_minor")
      .eq("org_id", org.id)
      .eq("invoice_id", id)
      .order("sort_order"),
    supabase.from("payments").select("id, direction, amount_minor, method, reference, received_on, note").eq("org_id", org.id).eq("invoice_id", id).order("received_on"),
    supabase.from("invoice_balances").select("paid_minor, due_minor").eq("org_id", org.id).eq("invoice_id", id).maybeSingle(),
    // A family's bill covers each pet booked together.
    inv.group_id
      ? supabase.from("bookings").select("id, pets(name)").eq("org_id", org.id).eq("group_id", inv.group_id).in("status", [...BILLABLE_IN_FAMILY]).order("created_at").order("id")
      : Promise.resolve({ data: [], error: null }),
    siteOrigin(),
  ]);
  if (lines.error || payments.error || balance.error || family.error) throw new Error("Could not load the bill.");
  const stays = inv.bookings ? [inv.bookings] : family.data;

  const money = (minor: number) => formatMoney(minor, { currency: inv.currency, locale, trimZeros: true });
  const due = balance.data?.due_minor ?? 0;
  const paid = balance.data?.paid_minor ?? 0;
  // The WhatsApp message is for the parent, in the kennel's language for parents.
  const p = parentI18n(org.parent_language, org.locale);
  const pet = stays.map((b) => b.pets?.name).filter(Boolean).join(", ") || p.m.bill.yourPet;
  const link = `${origin}/inv/${inv.public_token}`;
  const editable = inv.status === "draft" && canManage;
  const decimal = (minor: number) => toDecimalString(minor).replace(/\.00$/, "");

  return (
    <>
      <PageTitle title={inv.number ?? m.bill.draftTitle}>
        <Link href="/app/bills" className={buttonStyles.quiet}>
          {m.bill.allBills}
        </Link>
      </PageTitle>

      <div className="mb-5 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={inv.status === "void" ? "alert" : inv.status === "draft" ? "attention" : "neutral"}>{m.labels.invoiceStatus[inv.status]}</Badge>
          {inv.status === "issued" ? (
            due > 0 ? (
              <Badge tone="attention">{fill(m.bills.due, { amount: money(due) })}</Badge>
            ) : (
              <Badge tone="good">{m.bills.paid}</Badge>
            )
          ) : null}
          {inv.is_tax_invoice ? <Badge>{m.bill.taxInvoice}</Badge> : null}
        </p>
        {inv.clients ? (
          <p className="text-lg">
            {inv.clients.full_name},{" "}
            <a href={`tel:${inv.clients.phone}`} className="underline underline-offset-4">
              {formatPhone(inv.clients.phone)}
            </a>
          </p>
        ) : null}
        <p className="text-slate">
          {inv.issued_on ? `${fill(m.bill.issuedOn, { date: formatDate(inv.issued_on, locale) })} ` : ""}
          {stays.map((b, i) => (
            <span key={b.id}>
              {i > 0 ? ", " : null}
              <Link href={`/app/bookings/${b.id}`} className="underline underline-offset-4">
                {b.pets?.name ? fill(m.bill.petBooking, { pet: b.pets.name }) : m.bill.theBooking}
              </Link>
            </span>
          ))}
        </p>
        {inv.status === "void" && inv.void_reason ? <p className="text-slate">{fill(m.bill.cancelledBecause, { reason: inv.void_reason })}</p> : null}
      </div>

      {done ? <Notice tone="ok">{done}</Notice> : null}

      {inv.status === "draft" ? (
        <Section title={m.bill.next}>
          <ActionForm action={issueBill} className="space-y-3">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <p>{m.bill.issueHint}</p>
            <SubmitButton pendingLabel={m.bill.issuing}>{m.bill.issue}</SubmitButton>
          </ActionForm>
          {canManage ? null : <p className="mt-2 text-sm text-slate">{m.bill.managersOnly}</p>}
        </Section>
      ) : null}

      {inv.status === "issued" && inv.clients ? (
        <Section title={m.bill.sendTitle}>
          <div className="flex flex-wrap gap-2">
            <a
              href={whatsappLink(
                billMessage(
                  p.m.whatsapp,
                  {
                    kennelName: org.name,
                    parentName: inv.clients.full_name,
                    petName: pet,
                    invoiceNumber: inv.number ?? "",
                    dueMinor: Math.max(due, 0),
                    currency: inv.currency,
                    invoiceUrl: link,
                  },
                  p.locale,
                ),
                inv.clients.phone,
              )}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles.whatsapp}
            >
              {m.bill.send}
            </a>
            <CopyButton text={link} words={m.copy} />
            <a href={link} target="_blank" rel="noreferrer" className={buttonStyles.quiet}>
              {m.bill.openIt}
            </a>
          </div>
        </Section>
      ) : null}

      <Section title={m.bill.linesTitle}>
        <InvoiceView
          words={m}
          lines={lines.data.map((l) => ({
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
          taxMode={org.tax_mode}
          taxLabel={org.tax_label}
          showTax={inv.status === "draft" ? org.tax_mode !== "none" : inv.is_tax_invoice}
          lineActions={
            editable
              ? (i) => {
                  const l = lines.data[i];
                  return (
                    <details className="mt-2">
                      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold text-slate underline underline-offset-4">{m.common.change}</summary>
                      <LineForm
                        m={m}
                        invoiceId={inv.id}
                        index={i}
                        line={{ description: l.description, quantity: String(Number(l.quantity)), price: decimal(l.unit_price_minor), discount: l.discount_minor ? decimal(l.discount_minor) : "" }}
                      />
                      <ActionForm action={editLine} className="mt-2">
                        <input type="hidden" name="invoiceId" value={inv.id} />
                        <input type="hidden" name="index" value={i} />
                        <SubmitButton name="intent" value="remove" variant="quiet" pendingLabel={m.common.removing}>
                          {m.bill.removeLine}
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  );
                }
              : undefined
          }
        />
        {editable ? (
          <details className="mt-3 rounded-xl border border-rule bg-paper p-4">
            <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold">{m.bill.addLineTitle}</summary>
            <LineForm m={m} invoiceId={inv.id} />
          </details>
        ) : null}
        {inv.status === "draft" && stays.length > 0 ? (
          <ActionForm action={makeBill} className="mt-3">
            <input type="hidden" name="bookingId" value={stays[0].id} />
            <SubmitButton variant="quiet" pendingLabel={m.bill.rebuilding}>
              {m.bill.rebuild}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </Section>

      {inv.status !== "draft" ? (
        <Section title={m.bill.paymentsTitle} count={payments.data.length}>
          {payments.data.length === 0 ? (
            <Empty>{m.bill.noPayments}</Empty>
          ) : (
            <Ledger>
              {payments.data.map((x) => (
                <LedgerRow key={x.id}>
                  <span className="min-w-0 flex-1">
                    {fill(x.reference ? m.bill.paymentWithReference : m.bill.payment, {
                      date: formatDate(x.received_on, locale),
                      method: m.labels.paymentMethod[x.method],
                      reference: x.reference ?? "",
                    })}
                    {x.note ? <span className="block text-sm text-slate">{x.note}</span> : null}
                  </span>
                  <span className={`font-semibold tabular-nums ${x.direction === "out" ? "text-alert" : ""}`}>
                    {x.direction === "out" ? fill(m.bill.refund, { amount: money(x.amount_minor) }) : money(x.amount_minor)}
                  </span>
                </LedgerRow>
              ))}
              <LedgerRow>
                <span className="flex-1 font-bold">{fill(m.bill.paidTotal, { amount: money(paid) })}</span>
                <span className="font-extrabold">
                  {due > 0 ? fill(m.bills.due, { amount: money(due) }) : due < 0 ? fill(m.bill.paidOver, { amount: money(-due) }) : m.bill.nothingDue}
                </span>
              </LedgerRow>
            </Ledger>
          )}
          {inv.status === "issued" ? (
            <PaymentForm invoiceId={inv.id} defaultAmount={due > 0 ? decimal(due) : ""} today={todayIn(org.time_zone)} canRefund={canManage} words={m} />
          ) : null}
        </Section>
      ) : null}

      {inv.status === "issued" && canManage ? (
        <Section title={m.bill.cancelTitle}>
          <ActionForm action={voidBill} className="space-y-3 rounded-xl border border-rule bg-paper p-4">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <p className="text-slate">{m.bill.cancelHint}</p>
            <Field label={m.bill.cancelWhy}>
              <Input name="reason" required maxLength={500} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel={m.bill.cancelling}>
              {m.bill.cancel}
            </SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {inv.status === "draft" && canDelete ? (
        <ActionForm action={deleteDraft}>
          <input type="hidden" name="invoiceId" value={inv.id} />
          <ConfirmStep label={m.bill.deleteDraft} warning={m.common.cannotUndo} confirm={m.common.yesDelete} pending={m.bill.deleting} />
        </ActionForm>
      ) : null}
    </>
  );
}

function LineForm({
  m,
  invoiceId,
  index,
  line,
}: {
  m: Messages;
  invoiceId: string;
  index?: number;
  line?: { description: string; quantity: string; price: string; discount: string };
}) {
  const w = m.bill.line;
  return (
    <ActionForm action={editLine} className="mt-3 space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {index !== undefined ? <input type="hidden" name="index" value={index} /> : null}
      <Field label={w.what}>
        <Input name="description" required maxLength={300} defaultValue={line?.description} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label={w.howMany}>
          <Input name="quantity" inputMode="decimal" required defaultValue={line?.quantity ?? "1"} />
        </Field>
        <Field label={w.price}>
          <Input name="price" inputMode="decimal" required defaultValue={line?.price} />
        </Field>
        <Field label={w.discount}>
          <Input name="discount" inputMode="decimal" defaultValue={line?.discount} />
        </Field>
      </div>
      <SubmitButton variant="secondary" pendingLabel={index !== undefined ? m.common.saving : m.common.adding}>
        {index !== undefined ? w.save : w.add}
      </SubmitButton>
    </ActionForm>
  );
}
