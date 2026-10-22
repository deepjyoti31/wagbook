import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PhotoInput } from "@/components/photo-input";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { addDays, billPeriod, deliveryCutoff, formatDate, formatKg, todayIn } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { PROBLEM_KINDS, requestTime, weekdayList, WEEKDAYS } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import { cancelDelivery, changeSubscription, makeFoodBill, reportProblem, resolveProblem } from "../../actions";

export const generateMetadata = () => appTitle((m) => m.food.subscriptions);

export default function SubscriptionPage({ params, searchParams }: PageProps<"/app/food/subscriptions/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Subscription params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Subscription({ params, searchParams }: Pick<PageProps<"/app/food/subscriptions/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const done = (await searchParams).done;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale, language } = t;
  const f = m.food;
  const w = m.subscription;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);
  const sub = await supabase
    .from("subscriptions")
    .select("id, client_id, pet_id, plan, grams_per_day, weekdays, slot, address_id, starts_on, pay_period, source, paused_from, paused_until, cancelled_on, cancel_reason, pets(name), clients(full_name)")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (sub.error) throw new Error("Could not load the subscription.");
  if (!sub.data) notFound();
  const s = sub.data;
  const [deliveries, addresses, bills, recipes] = await Promise.all([
    supabase
      .from("deliveries")
      .select("id, delivery_date, slot, status, covers_days, packs, grams, recipe_id, cancel_reason, delivered_at, delivery_problems!delivery_problems_org_id_delivery_id_fkey(id, kind, note, outcome, reported_at)")
      .eq("org_id", org.id)
      .eq("subscription_id", id)
      .gte("delivery_date", addDays(today, -14))
      .order("delivery_date"),
    supabase.from("client_addresses").select("id, kind, line, area, postal_code").eq("org_id", org.id).eq("client_id", s.client_id).order("created_at"),
    supabase.from("invoices").select("id, status, number, period_start, period_end").eq("org_id", org.id).eq("subscription_id", id).neq("status", "void").order("period_start", { ascending: false }),
    supabase.from("recipes").select("id, name").eq("org_id", org.id),
  ]);
  if (deliveries.error || addresses.error || bills.error || recipes.error) throw new Error("Could not load the subscription.");
  const recipeName = new Map(recipes.data.map((r) => [r.id, r.name]));
  const address = addresses.data.find((a) => a.id === s.address_id);
  const ended = s.cancelled_on !== null && s.cancelled_on <= today;
  const now = requestTime();
  const closed = (d: { delivery_date: string; slot: "morning" | "afternoon" | "evening" }) => now >= deliveryCutoff(d.delivery_date, d.slot, org.time_zone, org.food_cutoff_hours).getTime();
  // The periods worth billing: this one and the next.
  const thisPeriod = billPeriod(today, s.pay_period);
  const nextPeriod = billPeriod(addDays(thisPeriod.to, 1), s.pay_period);
  const billed = new Set(bills.data.map((b) => b.period_start));
  const delivered = deliveries.data.filter((d) => d.status === "delivered" && d.delivered_at && now - new Date(d.delivered_at).getTime() < org.problem_window_hours * 3_600_000);
  const problems = deliveries.data.flatMap((d) => d.delivery_problems.map((p) => ({ ...p, delivery: d })));
  const pausedNow = s.paused_from !== null && (s.paused_until === null || s.paused_until >= today);

  return (
    <>
      <PageTitle title={fill(w.title, { pet: s.pets?.name ?? "" })}>
        <Link href="/app/food" className={buttonStyles.quiet}>
          {f.title}
        </Link>
      </PageTitle>
      {done === "started" ? <Notice tone="ok">{f.started}</Notice> : null}
      {done === "cancelled" ? <Notice tone="ok">{w.cancelledDelivery}</Notice> : null}
      {done === "replaced" ? <Notice tone="ok">{w.replaced}</Notice> : null}
      {done === "resolved" ? <Notice tone="ok">{m.common.saved}</Notice> : null}
      <div className="mb-5 space-y-1">
        <p className="text-lg">
          <Link href={`/app/clients/${s.client_id}`} className="font-semibold underline underline-offset-4">
            {fill(w.parent, { parent: s.clients?.full_name ?? "" })}
          </Link>
        </p>
        <p>{fill(w.details, { grams: s.grams_per_day, plan: m.plans[s.plan], days: weekdayList(m, s.weekdays), slot: m.slots[s.slot] })}</p>
        <p className="text-slate">{address ? fill(w.address, { address: [address.line, address.area, address.postal_code].filter(Boolean).join(", ") }) : w.collect}</p>
        <p className="text-slate">
          {fill(w.since, { date: formatDate(s.starts_on, locale), pay: f.pays[s.pay_period] })}. {fill(w.source, { source: m.sources[s.source] })}
        </p>
        <p className="flex flex-wrap gap-2">
          {ended ? <Badge>{fill(f.cancelled, { date: formatDate(s.cancelled_on!, locale) })}</Badge> : null}
          {!ended && pausedNow ? (
            <Badge tone="attention">{s.paused_until ? fill(f.pausedUntil, { date: formatDate(s.paused_until, locale) }) : f.paused}</Badge>
          ) : null}
        </p>
      </div>

      <Section title={w.deliveries} count={deliveries.data.length}>
        {deliveries.data.length === 0 ? (
          <Empty>{w.deliveriesNone}</Empty>
        ) : (
          <Ledger>
            {deliveries.data.map((d) => (
              <LedgerRow key={d.id}>
                <div className="min-w-48 flex-1">
                  <p className={d.status === "cancelled" ? "text-slate line-through" : "font-semibold"}>
                    {plural(language, d.packs, w.deliveryLine, { date: formatDate(d.delivery_date, locale), kg: formatKg(d.grams, locale), recipe: recipeName.get(d.recipe_id ?? "") ?? "" })}
                    {d.covers_days ? ` ${plural(language, d.covers_days, w.covers)}` : ""}
                  </p>
                  {d.cancel_reason ? <p className="text-sm text-slate">{d.cancel_reason}</p> : null}
                </div>
                <Badge tone={d.status === "delivered" ? "good" : d.status === "cancelled" ? "neutral" : "neutral"}>{m.deliveryStatus[d.status]}</Badge>
                {d.status === "planned" && d.delivery_date >= today ? (
                  closed(d) ? (
                    <Badge tone="attention">{w.pastCutoff}</Badge>
                  ) : (
                    <details className="w-full">
                      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{w.cancel}</summary>
                      <ActionForm action={cancelDelivery} className="mt-2 flex flex-wrap items-end gap-2">
                        <input type="hidden" name="deliveryId" value={d.id} />
                        <div className="min-w-48 flex-1">
                          <Field label={w.cancelReason}>
                            <Input name="reason" required maxLength={300} />
                          </Field>
                        </div>
                        <SubmitButton variant="secondary" pendingLabel={w.cancelling}>
                          {w.cancel}
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  )
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      <Section title={w.bills}>
        <p className="mb-2 text-sm text-slate">{w.billHint}</p>
        {bills.data.length > 0 ? (
          <Ledger>
            {bills.data.map((b) => (
              <li key={b.id}>
                <Link href={`/app/bills/${b.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                  <span className="flex-1">
                    {fill(w.billLine, { from: formatDate(b.period_start!, locale), to: formatDate(b.period_end!, locale), status: b.number ?? m.labels.invoiceStatus[b.status] })}
                  </span>
                  <Badge tone={b.status === "draft" ? "attention" : "neutral"}>{m.labels.invoiceStatus[b.status]}</Badge>
                </Link>
              </li>
            ))}
          </Ledger>
        ) : (
          <Empty>{w.billsNone}</Empty>
        )}
        <div className="mt-3 flex flex-wrap gap-2">
          {[thisPeriod, nextPeriod]
            .filter((p) => !billed.has(p.from))
            .map((p) => (
              <ActionForm key={p.from} action={makeFoodBill} className="contents">
                <input type="hidden" name="subscriptionId" value={s.id} />
                <input type="hidden" name="from" value={p.from} />
                <SubmitButton variant="secondary" pendingLabel={w.making}>
                  {fill(w.makeBill, { from: formatDate(p.from, locale), to: formatDate(p.to, locale) })}
                </SubmitButton>
              </ActionForm>
            ))}
        </div>
      </Section>

      {problems.length > 0 ? (
        <Section title={w.problems} count={problems.length}>
          <ul className="space-y-3">
            {problems.map((p) => (
              <li key={p.id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="font-semibold">
                  {formatDate(p.delivery.delivery_date, locale)}: {m.problemKinds[p.kind]}
                </p>
                {p.note ? <p className="text-slate">{p.note}</p> : null}
                {p.outcome ? (
                  <Badge tone="good">{fill(w.closed, { outcome: w.outcomes[p.outcome] })}</Badge>
                ) : (
                  <div className="mt-2 space-y-2">
                    <ActionForm action={resolveProblem} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="problemId" value={p.id} />
                      <input type="hidden" name="outcome" value="replaced" />
                      <Field label={w.replaceOn}>
                        <Input type="date" name="on" min={today} defaultValue={addDays(today, 1)} required />
                      </Field>
                      <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                        {w.replace}
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={resolveProblem} className="flex flex-wrap items-center gap-2">
                      <input type="hidden" name="problemId" value={p.id} />
                      <SubmitButton variant="quiet" name="outcome" value="refunded" pendingLabel={m.common.saving}>
                        {w.refund}
                      </SubmitButton>
                      <SubmitButton variant="quiet" name="outcome" value="none" pendingLabel={m.common.saving}>
                        {w.noRefund}
                      </SubmitButton>
                    </ActionForm>
                    <p className="text-sm text-slate">{w.refundHint}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {delivered.length > 0 ? (
        <Section title={w.report}>
          <ActionForm action={reportProblem} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <p className="text-sm text-slate sm:col-span-2">{fill(w.reportAbout, { hours: org.problem_window_hours })}</p>
            <Field label={w.which}>
              <Select name="deliveryId" required>
                {delivered.map((d) => (
                  <option key={d.id} value={d.id}>
                    {formatDate(d.delivery_date, locale)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.kind}>
              <Select name="kind" defaultValue="damaged">
                {PROBLEM_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {m.problemKinds[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <Field label={w.note}>
                <Input name="note" maxLength={500} />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <PhotoInput name="photo" label={w.photo} words={m.photos} />
            </div>
            <div className="sm:col-span-2">
              <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                {w.reportButton}
              </SubmitButton>
            </div>
          </ActionForm>
        </Section>
      ) : null}

      {ended ? null : (
        <>
          <Section title={w.change}>
            <ActionForm action={changeSubscription} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
              <input type="hidden" name="subscriptionId" value={s.id} />
              <p className="text-sm text-slate sm:col-span-2">{fill(w.changeAbout, { hours: org.food_cutoff_hours })}</p>
              <Field label={f.grams}>
                <Input name="grams" inputMode="numeric" required defaultValue={s.grams_per_day} />
              </Field>
              <Field label={f.plan}>
                <Select name="plan" defaultValue={s.plan}>
                  <option value="full">{m.plans.full}</option>
                  <option value="topper">{m.plans.topper}</option>
                </Select>
              </Field>
              <Field label={f.slot}>
                <Select name="slot" defaultValue={s.slot}>
                  {(["morning", "afternoon", "evening"] as const).map((x) => (
                    <option key={x} value={x}>
                      {m.slots[x]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={f.pay}>
                <Select name="pay" defaultValue={s.pay_period}>
                  <option value="week">{f.pays.week}</option>
                  <option value="month">{f.pays.month}</option>
                </Select>
              </Field>
              <fieldset className="sm:col-span-2">
                <legend className="mb-1 font-semibold">{f.days}</legend>
                <div className="flex flex-wrap gap-x-4">
                  {WEEKDAYS.map((d) => (
                    <label key={d} className="flex min-h-12 items-center gap-2">
                      <input type="checkbox" name={`day_${d}`} defaultChecked={s.weekdays.includes(d)} className="size-5" />
                      <span>{m.weekdays[d]}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="sm:col-span-2">
                <Field label={f.address}>
                  <Select name="addressId" defaultValue={s.address_id ?? ""}>
                    <option value="">{f.collect}</option>
                    {addresses.data.map((a) => (
                      <option key={a.id} value={a.id}>
                        {m.addresses.kind[a.kind]}: {[a.line, a.area, a.postal_code].filter(Boolean).join(", ")}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="sm:col-span-2">
                <SubmitButton pendingLabel={m.common.saving}>{m.common.saveChanges}</SubmitButton>
              </div>
            </ActionForm>
          </Section>

          <Section title={w.pause}>
            {pausedNow ? (
              <ActionForm action={changeSubscription} className="mb-3">
                <input type="hidden" name="subscriptionId" value={s.id} />
                <input type="hidden" name="intent" value="resume" />
                <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                  {w.resume}
                </SubmitButton>
              </ActionForm>
            ) : null}
            <ActionForm action={changeSubscription} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
              <input type="hidden" name="subscriptionId" value={s.id} />
              <input type="hidden" name="intent" value="pause" />
              <Field label={w.pauseFrom}>
                <Input type="date" name="from" min={today} defaultValue={addDays(today, 2)} required />
              </Field>
              <Field label={w.pauseUntil}>
                <Input type="date" name="until" min={today} />
              </Field>
              <div className="flex items-end">
                <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                  {w.pauseButton}
                </SubmitButton>
              </div>
            </ActionForm>
          </Section>

          <Section title={w.end}>
            <ActionForm action={changeSubscription} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
              <input type="hidden" name="subscriptionId" value={s.id} />
              <input type="hidden" name="intent" value="end" />
              <Field label={w.endOn}>
                <Input type="date" name="on" min={today} defaultValue={addDays(today, 2)} required />
              </Field>
              <Field label={w.endReason}>
                <Input name="reason" required maxLength={300} />
              </Field>
              <div className="flex items-end">
                <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                  {w.endButton}
                </SubmitButton>
              </div>
            </ActionForm>
          </Section>
        </>
      )}
    </>
  );
}
