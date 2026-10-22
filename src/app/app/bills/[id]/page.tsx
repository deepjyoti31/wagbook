import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { CopyButton } from "@/components/copy-button";
import { InvoiceView } from "@/components/invoice-view";
import { PaymentForm } from "@/components/payment-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { BILLABLE_IN_FAMILY } from "@/lib/billing";
import { billMessage, formatDate, formatMoney, formatPhone, todayIn, toDecimalString, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n } from "@/lib/i18n-server";
import { siteOrigin } from "@/lib/site";
import { creditForChange, nextMonth } from "@/lib/stay-bill";
import { createClient } from "@/lib/supabase/server";
import type { Messages } from "@/messages";
import { creditBill, deleteDraft, editLine, issueBill, makeBill, voidBill } from "../actions";

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
      "id, status, number, issued_on, is_tax_invoice, prices_include_tax, place_of_supply_state_code, seller, currency, booking_id, group_id, series_id, series_month, subscription_id, period_start, period_end, delivery_id, appointment_id, public_token, void_reason, notes, subtotal_minor, discount_minor, taxable_minor, cgst_minor, sgst_minor, igst_minor, tax_minor, round_off_minor, total_minor, clients(full_name, phone), bookings(id, pets(name))",
    )
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (res.error) throw new Error("Could not load the bill.");
  if (!res.data) notFound();
  const inv = res.data;

  const [lines, payments, balance, family, credits, origin, seriesDays] = await Promise.all([
    supabase
      .from("invoice_lines")
      .select("description, sac_code, quantity, unit_price_minor, discount_minor, taxable_minor, tax_rate_bp, cgst_minor, sgst_minor, igst_minor, tax_minor, total_minor")
      .eq("org_id", org.id)
      .eq("invoice_id", id)
      .order("sort_order"),
    supabase.from("payments").select("id, direction, amount_minor, method, reference, received_on, note").eq("org_id", org.id).eq("invoice_id", id).order("received_on"),
    supabase.from("invoice_balances").select("paid_minor, due_minor, credited_minor").eq("org_id", org.id).eq("invoice_id", id).maybeSingle(),
    // A family's bill covers each pet booked together.
    inv.group_id
      ? supabase.from("bookings").select("id, pets(name)").eq("org_id", org.id).eq("group_id", inv.group_id).in("status", [...BILLABLE_IN_FAMILY]).order("created_at").order("id")
      : Promise.resolve({ data: [], error: null }),
    supabase.from("credit_notes").select("id, number, issued_on, reason, total_minor").eq("org_id", org.id).eq("invoice_id", id).order("seq"),
    siteOrigin(),
    // A month of a repeating series (D41): its days that are billed.
    inv.series_id && inv.series_month
      ? supabase
          .from("bookings")
          .select("id, start_date, pets(name)")
          .eq("org_id", org.id)
          .eq("series_id", inv.series_id)
          .gte("start_date", inv.series_month)
          .lt("start_date", nextMonth(inv.series_month))
          .in("status", [...BILLABLE_IN_FAMILY])
          .order("start_date")
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (lines.error || payments.error || balance.error || family.error || credits.error || seriesDays.error) throw new Error("Could not load the bill.");
  const stays = inv.bookings ? [inv.bookings] : inv.group_id ? family.data : seriesDays.data.slice(0, 1);
  // A food bill (M29): the subscription or the order it is for.
  const food = inv.subscription_id
    ? (await supabase.from("subscriptions").select("id, pets(name)").eq("org_id", org.id).eq("id", inv.subscription_id).maybeSingle()).data
    : inv.delivery_id
      ? (await supabase.from("deliveries").select("id, pets(name)").eq("org_id", org.id).eq("id", inv.delivery_id).maybeSingle()).data
      : null;

  const money = (minor: number) => formatMoney(minor, { currency: inv.currency, locale, trimZeros: true });
  const due = balance.data?.due_minor ?? 0;
  const paid = balance.data?.paid_minor ?? 0;
  const credited = balance.data?.credited_minor ?? 0;
  // A tax invoice from an earlier month may be in a return already, and a credited bill is credited the rest of the way: no cancelling (WB095, WB096).
  const today = todayIn(org.time_zone);
  const earlierMonth = inv.is_tax_invoice && inv.issued_on !== null && inv.issued_on.slice(0, 7) < today.slice(0, 7);
  const canCancel = credits.data.length === 0 && !earlierMonth;
  const rates = [...new Set(lines.data.map((l) => l.tax_rate_bp))];
  // The WhatsApp message is for the parent, in the kennel's language for parents.
  const p = parentI18n(org.parent_language, org.locale);
  const pet = stays.map((b) => b.pets?.name).filter(Boolean).join(", ") || p.m.bill.yourPet;
  const link = `${origin}/inv/${inv.public_token}`;
  const editable = inv.status === "draft" && canManage;
  const decimal = (minor: number) => toDecimalString(minor).replace(/\.00$/, "");
  // An issued bill whose stays now come to less (D40): a pet went home early, a stay or a day was cancelled.
  const change =
    inv.status === "issued" && credited < inv.total_minor
      ? await creditForChange(supabase, org.id, inv, fill(m.bill.difference.whatDefault, { number: inv.number ?? "" }), org.round_invoice_totals)
      : null;
  const difference = change && !("error" in change) ? change.credit : null;

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
          {food && inv.subscription_id && inv.period_start && inv.period_end ? (
            <Link href={`/app/food/subscriptions/${inv.subscription_id}`} className="underline underline-offset-4">
              {fill(m.billFood.period, { pet: food.pets?.name ?? "", from: formatDate(inv.period_start, locale), to: formatDate(inv.period_end, locale) })}
            </Link>
          ) : null}
          {food && inv.delivery_id ? (
            <Link href="/app/food" className="underline underline-offset-4">
              {fill(m.billFood.order, { pet: food.pets?.name ?? "" })}
            </Link>
          ) : null}
          {inv.appointment_id ? (
            <Link href={`/app/appointments/${inv.appointment_id}`} className="underline underline-offset-4">
              {m.appointment.title}
            </Link>
          ) : null}
          {inv.series_month && stays[0] ? (
            <Link href={`/app/bookings/${stays[0].id}`} className="underline underline-offset-4">
              {fill(m.bill.seriesMonth, { pet: stays[0].pets?.name ?? m.bill.theBooking, month: monthName(inv.series_month, locale) })}
            </Link>
          ) : (
            stays.map((b, i) => (
              <span key={b.id}>
                {i > 0 ? ", " : null}
                <Link href={`/app/bookings/${b.id}`} className="underline underline-offset-4">
                  {b.pets?.name ? fill(m.bill.petBooking, { pet: b.pets.name }) : m.bill.theBooking}
                </Link>
              </span>
            ))
          )}
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

      {difference ? (
        <Section title={m.bill.difference.title}>
          <div className="space-y-3 rounded-xl border-2 border-marigold bg-marigold-soft p-4">
            <p>
              {fill(m.bill.difference.text, {
                now: money(change && !("error" in change) && change.now ? change.now.totalMinor : 0),
                amount: money(difference.totalMinor),
              })}
            </p>
            {canManage ? (
              <ActionForm action={creditBill} className="space-y-3">
                <input type="hidden" name="invoiceId" value={inv.id} />
                <input type="hidden" name="how" value="difference" />
                <input type="hidden" name="description" value={fill(m.bill.difference.whatDefault, { number: inv.number ?? "" })} />
                <Field label={m.bill.credit.why} hint={m.bill.credit.whyHint}>
                  <Input name="reason" required maxLength={500} defaultValue={change && !("error" in change) && change.now?.totalMinor === 0 ? m.bill.difference.reasonCancelled : m.bill.difference.reasonEarly} />
                </Field>
                <SubmitButton pendingLabel={m.bill.credit.making}>{fill(m.bill.difference.make, { amount: money(difference.totalMinor) })}</SubmitButton>
              </ActionForm>
            ) : (
              <p className="font-semibold">{m.bill.difference.askManager}</p>
            )}
          </div>
        </Section>
      ) : null}

      {credits.data.length > 0 ? (
        <Section title={m.invoice.creditNotes} count={credits.data.length}>
          <Ledger>
            {credits.data.map((c) => (
              <LedgerRow key={c.id}>
                <span className="min-w-0 flex-1">
                  <a href={`${link}?cn=${encodeURIComponent(c.number)}`} target="_blank" rel="noreferrer" className="font-semibold underline underline-offset-4">
                    {fill(m.bill.credit.made, { number: c.number, date: formatDate(c.issued_on, locale) })}
                  </a>
                  <span className="block text-sm text-slate">{c.reason}</span>
                </span>
                <span className="font-semibold tabular-nums">- {money(c.total_minor)}</span>
              </LedgerRow>
            ))}
          </Ledger>
        </Section>
      ) : null}

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
          {inv.status === "issued" && due < 0 ? <p className="mt-3 font-semibold">{fill(canManage ? m.bill.refundOwed : m.bill.refundOwedStaff, { amount: money(-due) })}</p> : null}
          {inv.status === "issued" ? (
            <PaymentForm invoiceId={inv.id} defaultAmount={due > 0 ? decimal(due) : due < 0 && canManage ? decimal(-due) : ""} today={today} canRefund={canManage} words={m} />
          ) : null}
        </Section>
      ) : null}

      {inv.status === "issued" && canManage ? (
        <Section title={m.bill.credit.title}>
          {credited >= inv.total_minor ? (
            <Empty>{m.bill.credit.nothingLeft}</Empty>
          ) : (
            <ActionForm action={creditBill} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
              <input type="hidden" name="invoiceId" value={inv.id} />
              <p className="text-slate">{m.bill.credit.about}</p>
              {credited > 0 ? <p className="font-semibold">{fill(m.bill.credit.left, { amount: money(inv.total_minor - credited) })}</p> : null}
              {credited === 0 ? (
                <fieldset className="space-y-1">
                  {(["part", "whole"] as const).map((how) => (
                    <label key={how} className="flex min-h-12 items-center gap-3">
                      <input type="radio" name="how" value={how} defaultChecked={how === "part"} className="size-5" />
                      <span>{how === "part" ? m.bill.credit.part : m.bill.credit.whole}</span>
                    </label>
                  ))}
                </fieldset>
              ) : null}
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={inv.is_tax_invoice ? (inv.prices_include_tax ? m.bill.credit.amountWith : m.bill.credit.amountBefore) : m.bill.credit.amount}>
                  <Input name="amount" inputMode="decimal" />
                </Field>
                {inv.is_tax_invoice ? (
                  <Field label={m.bill.credit.rate}>
                    <Select name="rate" defaultValue={String(rates[0] ?? 0)}>
                      {rates.map((r) => (
                        <option key={r} value={r}>
                          {fill(m.bill.credit.rateOption, { rate: r / 100 })}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ) : (
                  <input type="hidden" name="rate" value={String(rates[0] ?? 0)} />
                )}
              </div>
              <Field label={m.bill.credit.what}>
                <Input name="description" maxLength={300} defaultValue={fill(m.bill.credit.whatDefault, { number: inv.number ?? "" })} />
              </Field>
              <Field label={m.bill.credit.why} hint={m.bill.credit.whyHint}>
                <Input name="reason" required maxLength={500} />
              </Field>
              <SubmitButton variant="secondary" pendingLabel={m.bill.credit.making}>
                {m.bill.credit.make}
              </SubmitButton>
            </ActionForm>
          )}
        </Section>
      ) : null}

      {inv.status === "issued" && canManage && !canCancel ? (
        <Section title={m.bill.cancelTitle}>
          <p className="text-slate">{credits.data.length > 0 ? m.bill.cancelCredited : m.bill.cancelEarlier}</p>
        </Section>
      ) : null}

      {inv.status === "issued" && canManage && canCancel ? (
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

/** "October 2027", in the reader's language. */
function monthName(month: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}T00:00:00Z`));
}
