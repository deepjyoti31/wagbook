import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatKg, formatMoney, formatPhone } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { weekdayList } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import { confirmOrder, declineOrder } from "../actions";

export const generateMetadata = () => appTitle((m) => m.foodOrders.title);

export default function FoodOrdersPage({ searchParams }: PageProps<"/app/food/orders">) {
  return (
    <Suspense fallback={<Loading />}>
      <FoodOrders searchParams={searchParams} />
    </Suspense>
  );
}

async function FoodOrders({ searchParams }: Pick<PageProps<"/app/food/orders">, "searchParams">) {
  const done = (await searchParams).done;
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const w = m.foodOrders;
  const supabase = await createClient();
  const orders = await supabase
    .from("food_orders")
    .select("id, kind, status, client_id, parent_name, phone, pet_name, weight_g, plan, grams_per_day, weekdays, slot, line, area, postal_code, starts_on, until_date, grams, amount_minor, note, inscription, site_ref, site_source, created_at, clients(full_name, phone), subscriptions(pets(name)), food_products(name)")
    .eq("org_id", org.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (orders.error) throw new Error("Could not load orders.");
  const waiting = orders.data.filter((o) => ["unpaid", "paid", "requested"].includes(o.status));
  const finished = orders.data.filter((o) => ["confirmed", "declined"].includes(o.status)).slice(0, 30);
  const areaCounts = new Map<string, number>();
  for (const o of orders.data.filter((x) => x.status === "waiting_area")) areaCounts.set(o.postal_code ?? "", (areaCounts.get(o.postal_code ?? "") ?? 0) + 1);
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });

  const describe = (o: (typeof orders.data)[number]) => {
    const parent = o.parent_name ?? o.clients?.full_name ?? "";
    const phone = o.phone ?? o.clients?.phone ?? "";
    const lines: string[] = [fill(w.from, { parent, phone: phone ? formatPhone(phone) : "" })];
    if (o.kind === "trial" || o.kind === "subscription") {
      lines.push(fill(w.dog, { pet: o.pet_name ?? "", kg: o.weight_g ? formatKg(o.weight_g, locale) : "", plan: o.plan ? m.plans[o.plan] : "" }));
      if (o.kind === "subscription" && o.weekdays && o.slot) {
        lines.push(`${o.grams_per_day} g, ${fill(w.deliver, { days: weekdayList(m, o.weekdays), slot: m.slots[o.slot], address: [o.line, o.area, o.postal_code].filter(Boolean).join(", ") })}`);
      } else {
        lines.push([o.line, o.area, o.postal_code].filter(Boolean).join(", "));
      }
    } else if (o.kind === "item" && o.starts_on) {
      // A made-to-order item from outside (M68): what, for whom, when, and the words on it.
      lines.push(fill(w.itemLine, { item: o.food_products?.name ?? w.kinds.item, pet: o.pet_name ?? "", date: formatDate(o.starts_on, locale), slot: o.slot ? m.slots[o.slot] : "" }));
      if (o.inscription) lines.push(fill(w.inscription, { words: o.inscription }));
      lines.push([o.line, o.area, o.postal_code].filter(Boolean).join(", "));
    } else if (o.kind === "more" && o.starts_on) {
      lines.push(fill(w.more, { kg: formatKg(o.grams ?? 0, locale), date: formatDate(o.starts_on, locale) }));
    } else if (o.starts_on) {
      lines.push(o.until_date ? fill(w.changeUntil, { from: formatDate(o.starts_on, locale), until: formatDate(o.until_date, locale) }) : fill(w.change, { from: formatDate(o.starts_on, locale) }));
    }
    if (o.amount_minor !== null) lines.push(fill(w.amount, { amount: money(o.amount_minor) }));
    if (o.note) lines.push(o.note);
    if (o.site_ref) lines.push(fill(m.site.ref, { ref: o.site_ref }));
    if (o.site_source) lines.push(fill(m.site.came, { source: o.site_source }));
    return lines;
  };

  return (
    <>
      <PageTitle title={w.title}>
        <Link href="/app/food" className={buttonStyles.quiet}>
          {m.food.title}
        </Link>
      </PageTitle>
      {done === "confirmed" ? <Notice tone="ok">{w.confirmed}</Notice> : null}
      {done === "declined" ? <Notice tone="ok">{w.declined}</Notice> : null}

      <Section title={w.waiting} count={waiting.length}>
        {waiting.length === 0 ? (
          <Empty>{w.none}</Empty>
        ) : (
          <ul className="space-y-3">
            {waiting.map((o) => (
              <li key={o.id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="mb-1 flex flex-wrap items-center gap-2">
                  <span className="font-bold">{w.kinds[o.kind]}</span>
                  {o.kind === "pause" || o.kind === "skip" || o.kind === "more" ? <span>{o.subscriptions?.pets?.name}</span> : null}
                  <Badge tone={o.status === "paid" || o.status === "requested" ? "attention" : "neutral"}>{w.statuses[o.status]}</Badge>
                </p>
                {describe(o).map((line, i) => (
                  <p key={i} className={i === 0 ? "" : "text-slate"}>
                    {line}
                  </p>
                ))}
                {o.kind === "trial" || o.kind === "subscription" || o.kind === "item" ? <p className="mt-1 text-sm text-slate">{w.confirmHint}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionForm action={confirmOrder} className="contents">
                    <input type="hidden" name="orderId" value={o.id} />
                    <SubmitButton pendingLabel={w.confirming}>{w.confirm}</SubmitButton>
                  </ActionForm>
                  <ActionForm action={declineOrder} className="contents">
                    <input type="hidden" name="orderId" value={o.id} />
                    <SubmitButton variant="quiet" pendingLabel={w.declining}>
                      {w.decline}
                    </SubmitButton>
                  </ActionForm>
                  {o.client_id ? (
                    <Link href={`/app/clients/${o.client_id}`} className={buttonStyles.quiet}>
                      {w.openParent}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={w.byArea} count={areaCounts.size}>
        {areaCounts.size === 0 ? (
          <Empty>{w.none}</Empty>
        ) : (
          <Ledger>
            {[...areaCounts.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([pin, n]) => (
                <LedgerRow key={pin}>
                  <span className="flex-1">{fill(m.food.waitingAreaLine, { pin, count: n })}</span>
                </LedgerRow>
              ))}
          </Ledger>
        )}
      </Section>

      <Section title={w.done} count={finished.length}>
        {finished.length === 0 ? (
          <Empty>{w.none}</Empty>
        ) : (
          <Ledger>
            {finished.map((o) => (
              <LedgerRow key={o.id}>
                <span className="flex-1">
                  {w.kinds[o.kind]}: {o.parent_name ?? o.clients?.full_name}
                </span>
                <Badge tone={o.status === "confirmed" ? "good" : "neutral"}>{w.statuses[o.status]}</Badge>
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>
    </>
  );
}
