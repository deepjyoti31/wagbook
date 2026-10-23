import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonStyles, Empty, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { quantityText } from "@/lib/kitchen";
import { orderProgress } from "@/lib/orders";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.orders.title);

export default function OrdersPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Orders />
    </Suspense>
  );
}

async function Orders() {
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const o = m.orders;
  const supabase = await createClient();
  const [orders, suppliers] = await Promise.all([
    supabase.from("supplier_orders").select("id, ordered_on, status, sent_at, expense_id, suppliers(name)").eq("org_id", org.id).order("ordered_on", { ascending: false }).order("created_at", { ascending: false }).limit(60),
    supabase.from("suppliers").select("id, name").eq("org_id", org.id).eq("is_active", true).order("name"),
  ]);
  if (orders.error || suppliers.error) throw new Error("Could not load the orders.");
  const progress = await orderProgress(supabase, org.id, orders.data.map((x) => x.id));
  if (!progress) throw new Error("Could not load the orders.");
  const linesOf = (id: string) => progress.filter((p) => p.order_id === id);
  const waiting = orders.data.filter((x) => x.status === "open" && linesOf(x.id).some((l) => l.still_to_come > 0));
  const done = orders.data.filter((x) => !waiting.includes(x)).slice(0, 20);

  const card = (x: (typeof orders.data)[number]) => {
    const lines = linesOf(x.id);
    const left = lines.some((l) => l.still_to_come > 0);
    return (
      <li key={x.id}>
        <Link href={`/app/more/orders/${x.id}`} className="block rounded-xl border border-rule bg-paper p-4 hover:bg-ground">
          <p className="flex flex-wrap items-center gap-2">
            <span className="flex-1 font-bold">{x.suppliers?.name}</span>
            {x.status === "closed" ? <Badge>{o.closed}</Badge> : left ? <Badge tone="attention">{o.open}</Badge> : <Badge tone="good">{o.receivedInFull}</Badge>}
            {x.expense_id ? <Badge tone="good">{o.billed}</Badge> : null}
          </p>
          <p className="text-sm text-slate">
            {fill(o.orderedOn, { date: formatDate(x.ordered_on, locale) })}, {x.sent_at ? fill(o.sentOn, { when: formatDate(x.sent_at.slice(0, 10), locale) }) : o.notSent}
          </p>
          <ul className="mt-1">
            {lines.map((l) => (
              <li key={l.item_id}>
                {l.still_to_come > 0 && x.status === "open"
                  ? fill(o.lineLeft, {
                      item: l.name,
                      ordered: quantityText(l.ordered, l.unit, locale),
                      came: quantityText(l.received, l.unit, locale),
                      left: quantityText(l.still_to_come, l.unit, locale),
                    })
                  : fill(o.lineDone, { item: l.name, ordered: quantityText(l.ordered, l.unit, locale) })}
              </li>
            ))}
          </ul>
        </Link>
      </li>
    );
  };

  return (
    <>
      <PageTitle title={o.title}>
        <Link href="/app/kitchen/stock" className={buttonStyles.quiet}>
          {m.shop.links.stock}
        </Link>
      </PageTitle>
      <p className="mb-4 text-slate">{o.about}</p>
      {org.offers_kitchen || org.offers_shop ? null : <Notice tone="info">{m.kitchen.off}</Notice>}

      {canManage ? (
        <Section title={o.newOrder}>
          {suppliers.data.length === 0 ? (
            <Empty>{o.noSuppliers}</Empty>
          ) : (
            <div className="flex flex-wrap gap-2">
              {suppliers.data.map((s) => (
                <Link key={s.id} href={`/app/more/orders/new?supplier=${s.id}`} className={buttonStyles.secondary}>
                  {fill(o.newOrderTo, { supplier: s.name })}
                </Link>
              ))}
            </div>
          )}
        </Section>
      ) : null}

      <Section title={o.waiting} count={waiting.length}>
        {waiting.length === 0 ? <Empty>{o.noneWaiting}</Empty> : <ul className="space-y-3">{waiting.map(card)}</ul>}
      </Section>

      {done.length > 0 ? (
        <Section title={o.done}>
          <ul className="space-y-3">{done.map(card)}</ul>
        </Section>
      ) : null}
    </>
  );
}
