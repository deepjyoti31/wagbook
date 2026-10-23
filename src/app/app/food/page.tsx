import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { addDays, formatDate, formatKg, todayIn } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { planAhead, weekdayList } from "@/lib/kitchen";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { resolveProblem } from "./actions";

export const generateMetadata = () => appTitle((m) => m.food.title);

export default function FoodPage({ searchParams }: PageProps<"/app/food">) {
  return (
    <Suspense fallback={<Loading />}>
      <Food searchParams={searchParams} />
    </Suspense>
  );
}

async function Food({ searchParams }: Pick<PageProps<"/app/food">, "searchParams">) {
  const query = await searchParams;
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale, language } = t;
  const f = m.food;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);
  await planAhead(supabase, org);
  const [orders, subs, deliveries, problems] = await Promise.all([
    supabase.from("food_orders").select("id, kind, status, parent_name, pet_name, clients(full_name)").eq("org_id", org.id).in("status", ["unpaid", "paid", "requested"]).order("created_at"),
    supabase
      .from("subscriptions")
      .select("id, grams_per_day, weekdays, slot, paused_from, paused_until, cancelled_on, pets(name), clients(full_name)")
      .eq("org_id", org.id)
      .or(`cancelled_on.is.null,cancelled_on.gt.${addDays(today, -30)}`)
      .order("created_at", { ascending: false }),
    supabase
      .from("deliveries")
      .select("id, kind, status, delivery_date, slot, packs, grams, quantity, subscription_id, pets(name), clients(full_name)")
      .eq("org_id", org.id)
      .gte("delivery_date", today)
      .lte("delivery_date", addDays(today, 6))
      .neq("status", "cancelled")
      .order("delivery_date")
      .order("slot"),
    // Problems told by parents or written down by staff, not dealt with yet (M59).
    supabase
      .from("delivery_problems")
      .select("id, kind, note, photo_path, from_parent, reported_at, deliveries!delivery_problems_org_id_delivery_id_fkey(delivery_date, subscription_id, pets(name))")
      .eq("org_id", org.id)
      .is("outcome", null)
      .order("reported_at"),
  ]);
  if (orders.error || subs.error || deliveries.error || problems.error) throw new Error("Could not load food.");
  const photos = await signedUrls(supabase, problems.data.map((p) => p.photo_path));
  const paused = (s: (typeof subs.data)[number]) => s.paused_from !== null && s.paused_from <= today && (s.paused_until === null || s.paused_until >= today);

  return (
    <>
      <PageTitle title={f.title}>
        <Link href="/app/food/new" className={buttonStyles.primary}>
          {f.start}
        </Link>
      </PageTitle>
      {org.offers_food_delivery ? null : <Notice tone="info">{f.off}</Notice>}
      <nav className="mb-5 flex flex-wrap gap-2">
        <Link href="/app/food/runs" className={buttonStyles.secondary}>
          {f.links.runs}
        </Link>
        <Link href="/app/food/orders" className={buttonStyles.secondary}>
          {f.links.orders}
        </Link>
        <Link href="/app/food/new?kind=order" className={buttonStyles.secondary}>
          {f.order}
        </Link>
        <Link href="/app/kitchen" className={buttonStyles.quiet}>
          {f.links.kitchen}
        </Link>
      </nav>

      {query.done === "replaced" || query.done === "resolved" ? (
        <Notice tone="ok">{query.done === "replaced" ? m.subscription.replaced : m.common.saved}</Notice>
      ) : null}
      {problems.data.length > 0 ? (
        <Section title={f.problems} count={problems.data.length}>
          <ul className="space-y-3">
            {problems.data.map((p) => {
              const line = fill(f.problemLine, { date: formatDate(p.deliveries?.delivery_date ?? today, locale), pet: p.deliveries?.pets?.name ?? "", kind: m.problemKinds[p.kind] });
              return (
                <li key={p.id} className="rounded-xl border border-rule bg-paper p-4">
                  <p className="flex flex-wrap items-center gap-2">
                    {p.deliveries?.subscription_id ? (
                      <Link href={`/app/food/subscriptions/${p.deliveries.subscription_id}`} className="flex-1 font-semibold underline underline-offset-4">
                        {line}
                      </Link>
                    ) : (
                      <span className="flex-1 font-semibold">{line}</span>
                    )}
                    {p.from_parent ? <Badge tone="attention">{m.subscription.fromParent}</Badge> : null}
                  </p>
                  {p.note ? <p className="text-slate">{p.note}</p> : null}
                  {p.photo_path && photos.get(p.photo_path) ? (
                    <a href={photos.get(p.photo_path)} target="_blank" rel="noreferrer" className="mt-2 block w-32">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link, not an optimisable image */}
                      <img src={photos.get(p.photo_path)} alt={m.subscription.problemPhoto} className="aspect-square w-32 rounded-lg object-cover" />
                    </a>
                  ) : null}
                  {/* A trial or an order has no subscription page: it is dealt with here. */}
                  {p.deliveries?.subscription_id ? null : (
                    <div className="mt-2 space-y-2">
                      <ActionForm action={resolveProblem} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="problemId" value={p.id} />
                        <input type="hidden" name="outcome" value="replaced" />
                        <Field label={m.subscription.replaceOn}>
                          <Input type="date" name="on" min={today} defaultValue={addDays(today, 1)} required />
                        </Field>
                        <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                          {m.subscription.replace}
                        </SubmitButton>
                      </ActionForm>
                      <ActionForm action={resolveProblem} className="flex flex-wrap items-center gap-2">
                        <input type="hidden" name="problemId" value={p.id} />
                        <SubmitButton variant="quiet" name="outcome" value="refunded" pendingLabel={m.common.saving}>
                          {m.subscription.refund}
                        </SubmitButton>
                        <SubmitButton variant="quiet" name="outcome" value="none" pendingLabel={m.common.saving}>
                          {m.subscription.noRefund}
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </Section>
      ) : null}

      <Section title={f.orders} count={orders.data.length}>
        {orders.data.length === 0 ? (
          <Empty>{f.ordersNone}</Empty>
        ) : (
          <Ledger>
            {orders.data.map((o) => (
              <li key={o.id}>
                <Link href="/app/food/orders" className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                  <span className="flex-1 font-semibold">
                    {fill(f.orderLine, { kind: m.foodOrders.kinds[o.kind], parent: o.parent_name ?? o.clients?.full_name ?? "", pet: o.pet_name ?? "" })}
                  </span>
                  <Badge tone={o.status === "unpaid" ? "neutral" : "attention"}>{m.foodOrders.statuses[o.status]}</Badge>
                </Link>
              </li>
            ))}
          </Ledger>
        )}
      </Section>

      <Section title={f.upcoming} count={deliveries.data.length}>
        <p className="mb-2 text-sm text-slate">{f.plannedAhead}</p>
        {deliveries.data.length === 0 ? (
          <Empty>{f.upcomingNone}</Empty>
        ) : (
          <Ledger>
            {deliveries.data.map((d) => (
              <li key={d.id}>
                <Link
                  href={d.subscription_id ? `/app/food/subscriptions/${d.subscription_id}` : `/app/kitchen?date=${d.delivery_date}`}
                  className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground"
                >
                  <span className="flex-1">
                    {fill(f.deliveryLine, {
                      date: formatDate(d.delivery_date, locale),
                      slot: m.slots[d.slot],
                      pet: d.pets?.name ?? "",
                      parent: d.clients?.full_name ?? "",
                      what: d.kind === "item" ? fill(f.pieces, { n: d.quantity }) : plural(language, d.packs, f.packsOf, { kg: formatKg(d.grams, locale) }),
                    })}
                  </span>
                  {d.kind !== "subscription" ? <Badge>{m.deliveryKinds[d.kind]}</Badge> : null}
                  <Badge tone={d.status === "planned" ? "neutral" : "good"}>{m.deliveryStatus[d.status]}</Badge>
                </Link>
              </li>
            ))}
          </Ledger>
        )}
      </Section>

      <Section title={f.subscriptions} count={subs.data.length}>
        {subs.data.length === 0 ? (
          <Empty>{f.subscriptionsNone}</Empty>
        ) : (
          <Ledger>
            {subs.data.map((s) => (
              <li key={s.id}>
                <Link href={`/app/food/subscriptions/${s.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                  <span className="flex-1">
                    {fill(f.subscriptionLine, {
                      pet: s.pets?.name ?? "",
                      parent: s.clients?.full_name ?? "",
                      grams: s.grams_per_day,
                      days: weekdayList(m, s.weekdays),
                      slot: m.slots[s.slot],
                    })}
                  </span>
                  {s.cancelled_on && s.cancelled_on <= today ? (
                    <Badge>{fill(f.cancelled, { date: formatDate(s.cancelled_on, locale) })}</Badge>
                  ) : paused(s) ? (
                    <Badge tone="attention">{s.paused_until ? fill(f.pausedUntil, { date: formatDate(s.paused_until, locale) }) : f.paused}</Badge>
                  ) : null}
                </Link>
              </li>
            ))}
          </Ledger>
        )}
      </Section>
    </>
  );
}
