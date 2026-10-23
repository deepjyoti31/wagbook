import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PhotoInput } from "@/components/photo-input";
import { Badge, buttonStyles, Field, Input, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatMoney, todayIn, typedQuantity, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { quantityText } from "@/lib/kitchen";
import { orderProgress } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";
import { closeOrder, markSent, receiveOrder, recordOrderBill } from "../actions";

export const generateMetadata = () => appTitle((m) => m.orders.title);

export default function OrderPage({ params, searchParams }: PageProps<"/app/more/orders/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Order params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const DONE = ["sent", "received", "bill", "closed"] as const;

async function Order({ params, searchParams }: Pick<PageProps<"/app/more/orders/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const o = m.orders;
  const p = m.orderPage;
  const supabase = await createClient();
  const order = await supabase
    .from("supplier_orders")
    .select("id, ordered_on, status, note, sent_at, expense_id, bill_number, suppliers(name, phone)")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (order.error) throw new Error("Could not load the order.");
  if (!order.data) notFound();
  const x = order.data;
  const lines = await orderProgress(supabase, org.id, [x.id]);
  if (!lines) throw new Error("Could not load the order.");
  // The bill's amount is an expense, for owners and managers only.
  const expense = x.expense_id && canManage ? (await supabase.from("expenses").select("amount_minor").eq("org_id", org.id).eq("id", x.expense_id).maybeSingle()).data : null;
  const today = todayIn(org.time_zone);
  const left = lines.filter((l) => l.still_to_come > 0);
  const open = x.status === "open" && left.length > 0;
  const supplier = x.suppliers?.name ?? "";
  const done = DONE.find((d) => d === query.done);
  const doneText = { sent: p.marked, received: p.received, bill: p.billRecorded, closed: p.closedOk };
  const items = lines.map((l) => fill(p.messageLine, { item: l.name, quantity: quantityText(l.ordered, l.unit, locale) })).join("\n");
  const message = fill(p.message, { supplier, kennel: org.name, items, note: x.note ? fill(p.messageNote, { note: x.note }) : "" });

  return (
    <>
      <PageTitle title={fill(p.title, { supplier })}>
        <Link href="/app/more/orders" className={buttonStyles.quiet}>
          {o.title}
        </Link>
      </PageTitle>
      <p className="mb-2 flex flex-wrap items-center gap-2">
        {x.status === "closed" ? <Badge>{o.closed}</Badge> : open ? <Badge tone="attention">{o.open}</Badge> : <Badge tone="good">{o.receivedInFull}</Badge>}
        <span className="text-slate">
          {fill(o.orderedOn, { date: formatDate(x.ordered_on, locale) })}, {x.sent_at ? fill(o.sentOn, { when: formatDate(x.sent_at.slice(0, 10), locale) }) : o.notSent}
        </span>
      </p>
      {x.note ? <p className="mb-2 text-slate">{x.note}</p> : null}
      {done ? <Notice tone="ok">{doneText[done]}</Notice> : null}

      <ul className="mb-5 divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
        {lines.map((l) => (
          <li key={l.item_id} className="px-4 py-3">
            {fill(o.lineLeft, {
              item: l.name,
              ordered: quantityText(l.ordered, l.unit, locale),
              came: quantityText(l.received, l.unit, locale),
              left: quantityText(l.still_to_come, l.unit, locale),
            })}
          </li>
        ))}
      </ul>

      {canManage && x.status === "open" ? (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <a href={whatsappLink(message, x.suppliers?.phone)} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
            {p.send}
          </a>
          {x.sent_at ? null : (
            <ActionForm action={markSent} className="">
              <input type="hidden" name="orderId" value={x.id} />
              <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                {p.markSent}
              </SubmitButton>
            </ActionForm>
          )}
        </div>
      ) : null}

      {open ? (
        <Section title={p.receive}>
          <ActionForm action={receiveOrder} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <p className="text-sm text-slate">{p.receiveAbout}</p>
            <input type="hidden" name="orderId" value={x.id} />
            <ul className="space-y-4">
              {left.map((l) => (
                <li key={l.item_id} className="grid gap-3 sm:grid-cols-3">
                  <Field label={`${p.came}: ${l.name}`}>
                    <Input name={`q-${l.item_id}`} autoComplete="off" defaultValue={typedQuantity(l.still_to_come, l.unit)} />
                  </Field>
                  <Field label={p.useBy}>
                    <Input name={`useBy-${l.item_id}`} type="date" min={today} />
                  </Field>
                  {canManage ? (
                    <Field label={p.cost} hint={p.costHint}>
                      <Input name={`cost-${l.item_id}`} inputMode="decimal" autoComplete="off" />
                    </Field>
                  ) : null}
                </li>
              ))}
            </ul>
            <Field label={p.receivedOn}>
              <Input name="on" type="date" defaultValue={today} max={today} required />
            </Field>
            <SubmitButton pendingLabel={m.common.saving}>{p.putInStock}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {canManage ? (
        <Section title={p.bill}>
          {x.expense_id ? (
            <p>{fill(p.billDone, { amount: expense ? formatMoney(expense.amount_minor, { currency: org.currency, locale, trimZeros: true }) : (x.bill_number ?? "") })}</p>
          ) : (
            <ActionForm action={recordOrderBill} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
              <p className="text-sm text-slate sm:col-span-2">{p.billAbout}</p>
              <input type="hidden" name="orderId" value={x.id} />
              <Field label={p.amount}>
                <Input name="amount" inputMode="decimal" required autoComplete="off" />
              </Field>
              <Field label={p.billDate}>
                <Input name="on" type="date" defaultValue={today} max={today} required />
              </Field>
              <Field label={p.billNumber}>
                <Input name="billNumber" maxLength={40} autoComplete="off" />
              </Field>
              <Field label={p.category}>
                <Input name="category" maxLength={60} required defaultValue={m.stock.expenseCategory} autoComplete="off" />
              </Field>
              <div className="sm:col-span-2">
                <PhotoInput name="bill" label={p.billPhoto} accept="image/*,application/pdf" words={m.photos} />
              </div>
              <div className="sm:col-span-2">
                <SubmitButton pendingLabel={m.common.saving}>{p.recordBill}</SubmitButton>
              </div>
            </ActionForm>
          )}
        </Section>
      ) : null}

      {canManage && open ? (
        <Section title={p.close}>
          <ActionForm action={closeOrder} className="space-y-3">
            <p className="text-sm text-slate">{p.closeAbout}</p>
            <input type="hidden" name="orderId" value={x.id} />
            <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
              {p.closeButton}
            </SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
