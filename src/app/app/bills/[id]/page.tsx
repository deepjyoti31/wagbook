import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { InvoiceView } from "@/components/invoice-view";
import { PaymentForm } from "@/components/payment-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { INVOICE_STATUS_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/billing";
import { billMessage, formatDate, formatMoney, formatPhone, todayIn, toDecimalString, whatsappLink } from "@/lib/core";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { deleteDraft, editLine, issueBill, makeBill, voidBill } from "../actions";

export const metadata: Metadata = { title: "Bill" };

export default function BillPage({ params, searchParams }: PageProps<"/app/bills/[id]">) {
  return (
    <Suspense fallback={<Loading label="Loading the bill" />}>
      <Bill params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const DONE: Record<string, string> = {
  issued: "Issued. The bill now has its number and cannot be changed. Send it to the parent.",
  void: "Bill cancelled. Its number stays used. Make a new bill from the booking if needed.",
};

async function Bill({ params, searchParams }: Pick<PageProps<"/app/bills/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const doneKey = (await searchParams).done;
  const done = typeof doneKey === "string" ? DONE[doneKey] : undefined;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
  const supabase = await createClient();

  const res = await supabase
    .from("invoices")
    .select(
      "id, status, number, issued_on, is_tax_invoice, currency, booking_id, public_token, void_reason, notes, subtotal_minor, discount_minor, taxable_minor, cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor, clients(full_name, phone), bookings(id, pets(name))",
    )
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (res.error) throw new Error("Could not load the bill.");
  if (!res.data) notFound();
  const inv = res.data;

  const [lines, payments, balance, origin] = await Promise.all([
    supabase
      .from("invoice_lines")
      .select("description, sac_code, quantity, unit_price_minor, discount_minor, taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, igst_minor, tax_minor, total_minor")
      .eq("org_id", org.id)
      .eq("invoice_id", id)
      .order("sort_order"),
    supabase.from("payments").select("id, direction, amount_minor, method, reference, received_on, note").eq("org_id", org.id).eq("invoice_id", id).order("received_on"),
    supabase.from("invoice_balances").select("paid_minor, due_minor").eq("org_id", org.id).eq("invoice_id", id).maybeSingle(),
    siteOrigin(),
  ]);
  if (lines.error || payments.error || balance.error) throw new Error("Could not load the bill.");

  const money = (minor: number) => formatMoney(minor, { currency: inv.currency, locale: org.locale, trimZeros: true });
  const due = balance.data?.due_minor ?? 0;
  const paid = balance.data?.paid_minor ?? 0;
  const pet = inv.bookings?.pets?.name ?? "your pet";
  const link = `${origin}/inv/${inv.public_token}`;
  const editable = inv.status === "draft" && canManage;
  const decimal = (minor: number) => toDecimalString(minor).replace(/\.00$/, "");

  return (
    <>
      <PageTitle title={inv.number ?? "Draft bill"}>
        <Link href="/app/bills" className={buttonStyles.quiet}>
          All bills
        </Link>
      </PageTitle>

      <div className="mb-5 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={inv.status === "void" ? "alert" : inv.status === "draft" ? "attention" : "neutral"}>{INVOICE_STATUS_LABEL[inv.status]}</Badge>
          {inv.status === "issued" ? due > 0 ? <Badge tone="attention">{money(due)} due</Badge> : <Badge tone="good">Paid</Badge> : null}
          {inv.is_tax_invoice ? <Badge>Tax invoice</Badge> : null}
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
          {inv.issued_on ? `Issued ${formatDate(inv.issued_on)}. ` : ""}
          {inv.bookings ? (
            <Link href={`/app/bookings/${inv.bookings.id}`} className="underline underline-offset-4">
              {inv.bookings.pets?.name ?? "The"} booking
            </Link>
          ) : null}
        </p>
        {inv.status === "void" && inv.void_reason ? <p className="text-slate">Cancelled: {inv.void_reason}</p> : null}
      </div>

      {done ? <Notice tone="ok">{done}</Notice> : null}

      {inv.status === "draft" ? (
        <Section title="Next">
          <ActionForm action={issueBill} className="space-y-3">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <p>Check the bill, then issue it. Issuing gives it a number and freezes it.</p>
            <SubmitButton pendingLabel="Issuing">Issue bill</SubmitButton>
          </ActionForm>
          {canManage ? null : <p className="mt-2 text-sm text-slate">Only an owner or manager can change what a bill charges.</p>}
        </Section>
      ) : null}

      {inv.status === "issued" && inv.clients ? (
        <Section title="Send to the parent">
          <div className="flex flex-wrap gap-2">
            <a
              href={whatsappLink(
                billMessage({
                  kennelName: org.name,
                  parentName: inv.clients.full_name,
                  petName: pet,
                  invoiceNumber: inv.number ?? "",
                  dueMinor: Math.max(due, 0),
                  currency: inv.currency,
                  invoiceUrl: link,
                }),
                inv.clients.phone,
              )}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles.whatsapp}
            >
              Send bill
            </a>
            <CopyButton text={link} />
            <a href={link} target="_blank" rel="noreferrer" className={buttonStyles.quiet}>
              Open it
            </a>
          </div>
        </Section>
      ) : null}

      <Section title="The bill">
        <InvoiceView
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
          locale={org.locale}
          taxMode={org.tax_mode}
          taxLabel={org.tax_label}
          showTax={inv.status === "draft" ? org.tax_mode !== "none" : inv.is_tax_invoice}
          lineActions={
            editable
              ? (i) => {
                  const l = lines.data[i];
                  return (
                    <details className="mt-2">
                      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold text-slate underline underline-offset-4">Change</summary>
                      <LineForm invoiceId={inv.id} index={i} line={{ description: l.description, quantity: String(Number(l.quantity)), price: decimal(l.unit_price_minor), discount: l.discount_minor ? decimal(l.discount_minor) : "" }} />
                      <ActionForm action={editLine} className="mt-2">
                        <input type="hidden" name="invoiceId" value={inv.id} />
                        <input type="hidden" name="index" value={i} />
                        <SubmitButton name="intent" value="remove" variant="quiet" pendingLabel="Removing">
                          Remove this line
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
            <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold">Add a line</summary>
            <LineForm invoiceId={inv.id} />
          </details>
        ) : null}
        {inv.status === "draft" && inv.booking_id ? (
          <ActionForm action={makeBill} className="mt-3">
            <input type="hidden" name="bookingId" value={inv.booking_id} />
            <SubmitButton variant="quiet" pendingLabel="Rebuilding">
              Rebuild from the booking
            </SubmitButton>
          </ActionForm>
        ) : null}
      </Section>

      {inv.status !== "draft" ? (
        <Section title="Payments" count={payments.data.length}>
          {payments.data.length === 0 ? (
            <Empty>Nothing recorded yet. Check your bank or UPI app, then record what came in.</Empty>
          ) : (
            <Ledger>
              {payments.data.map((p) => (
                <LedgerRow key={p.id}>
                  <span className="min-w-0 flex-1">
                    {formatDate(p.received_on)}, {PAYMENT_METHOD_LABEL[p.method]}
                    {p.reference ? `, ${p.reference}` : ""}
                    {p.note ? <span className="block text-sm text-slate">{p.note}</span> : null}
                  </span>
                  <span className={`font-semibold tabular-nums ${p.direction === "out" ? "text-alert" : ""}`}>
                    {p.direction === "out" ? `Refund ${money(p.amount_minor)}` : money(p.amount_minor)}
                  </span>
                </LedgerRow>
              ))}
              <LedgerRow>
                <span className="flex-1 font-bold">Paid {money(paid)}</span>
                <span className="font-extrabold">{due > 0 ? `${money(due)} due` : due < 0 ? `${money(-due)} paid over` : "Nothing due"}</span>
              </LedgerRow>
            </Ledger>
          )}
          {inv.status === "issued" ? (
            <PaymentForm invoiceId={inv.id} defaultAmount={due > 0 ? decimal(due) : ""} today={todayIn(org.time_zone)} canRefund={canManage} />
          ) : null}
        </Section>
      ) : null}

      {inv.status === "issued" && canManage ? (
        <Section title="Cancel this bill">
          <ActionForm action={voidBill} className="space-y-3 rounded-xl border border-rule bg-paper p-4">
            <input type="hidden" name="invoiceId" value={inv.id} />
            <p className="text-slate">A cancelled bill keeps its number. Payments on it move to the next bill made for the same stay.</p>
            <Field label="Why is it cancelled?">
              <Input name="reason" required maxLength={500} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel="Cancelling">
              Cancel bill
            </SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {inv.status === "draft" && canManage ? (
        <ActionForm action={deleteDraft}>
          <input type="hidden" name="invoiceId" value={inv.id} />
          <SubmitButton variant="quiet" pendingLabel="Deleting">
            Delete this draft
          </SubmitButton>
        </ActionForm>
      ) : null}
    </>
  );
}

function LineForm({ invoiceId, index, line }: { invoiceId: string; index?: number; line?: { description: string; quantity: string; price: string; discount: string } }) {
  return (
    <ActionForm action={editLine} className="mt-3 space-y-3">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      {index !== undefined ? <input type="hidden" name="index" value={index} /> : null}
      <Field label="What">
        <Input name="description" required maxLength={300} defaultValue={line?.description} />
      </Field>
      <div className="grid grid-cols-3 gap-3">
        <Field label="How many">
          <Input name="quantity" inputMode="decimal" required defaultValue={line?.quantity ?? "1"} />
        </Field>
        <Field label="Price">
          <Input name="price" inputMode="decimal" required defaultValue={line?.price} />
        </Field>
        <Field label="Discount">
          <Input name="discount" inputMode="decimal" defaultValue={line?.discount} />
        </Field>
      </div>
      <SubmitButton variant="secondary">{index !== undefined ? "Save line" : "Add line"}</SubmitButton>
    </ActionForm>
  );
}
