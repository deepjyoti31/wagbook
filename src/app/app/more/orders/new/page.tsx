import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Empty, Field, Input, Loading, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { typedQuantity } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { quantityText } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import type { Messages } from "@/messages";
import { placeOrder } from "../actions";

export const generateMetadata = () => appTitle((m) => m.orders.newOrder);

export default function NewOrderPage({ searchParams }: PageProps<"/app/more/orders/new">) {
  return (
    <Suspense fallback={<Loading />}>
      <NewOrder searchParams={searchParams} />
    </Suspense>
  );
}

interface Item {
  item_id: string;
  name: string;
  unit: "g" | "ml" | "piece";
  supplier_id: string | null;
  on_hand: number;
}

/**
 * A new order to one supplier: how much of each thing, in its own unit. The
 * supplier's usual things come first, with anything the shopping list or the
 * shop asked for (`q-{item}` in the address, in the item's unit) filled in.
 */
async function NewOrder({ searchParams }: Pick<PageProps<"/app/more/orders/new">, "searchParams">) {
  const query = await searchParams;
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const p = m.orderPage;
  const supplierId = typeof query.supplier === "string" && /^[0-9a-f-]{36}$/.test(query.supplier) ? query.supplier : null;
  if (!supplierId) notFound();
  const supabase = await createClient();
  const [supplier, levels, onOrder] = await Promise.all([
    supabase.from("suppliers").select("id, name").eq("org_id", org.id).eq("id", supplierId).maybeSingle(),
    supabase.from("stock_levels").select("item_id, name, unit, supplier_id, on_hand, is_active").eq("org_id", org.id).eq("is_active", true).order("name"),
    supabase.from("stock_on_order").select("item_id, on_order").eq("org_id", org.id),
  ]);
  if (supplier.error || levels.error || onOrder.error) throw new Error("Could not load the order.");
  if (!supplier.data) notFound();
  const title = <PageTitle title={fill(p.title, { supplier: supplier.data.name })} />;
  if (!canManage)
    return (
      <>
        {title}
        <Empty>{p.errors.managers}</Empty>
      </>
    );

  const items: Item[] = levels.data.map((i) => ({ item_id: i.item_id!, name: i.name!, unit: i.unit!, supplier_id: i.supplier_id, on_hand: i.on_hand ?? 0 }));
  const coming = new Map(onOrder.data.map((o) => [o.item_id!, o.on_order ?? 0]));
  const asked = (id: string) => {
    const raw = query[`q-${id}`];
    return typeof raw === "string" && /^\d{1,9}$/.test(raw) && Number(raw) > 0 ? Number(raw) : null;
  };
  const first = items.filter((i) => i.supplier_id === supplierId || asked(i.item_id) !== null);
  const rest = items.filter((i) => !first.includes(i));

  return (
    <>
      {title}
      <p className="mb-4">
        <Link href="/app/more/orders" className={buttonStyles.quiet}>
          {m.orders.title}
        </Link>
      </p>
      <Section title={m.orders.newOrder}>
        {items.length === 0 ? (
          <Empty>{m.stock.empty}</Empty>
        ) : (
          <ActionForm action={placeOrder} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <p className="text-sm text-slate">{p.newAbout}</p>
            <input type="hidden" name="supplierId" value={supplierId} />
            {first.length > 0 ? (
              <>
                <h3 className="font-bold">{fill(p.usual, { supplier: supplier.data.name })}</h3>
                <Lines items={first} m={m} locale={locale} coming={coming} asked={asked} />
              </>
            ) : null}
            {rest.length > 0 ? (
              <details open={first.length === 0}>
                <summary className="inline-flex min-h-12 cursor-pointer items-center font-bold">{p.others}</summary>
                <Lines items={rest} m={m} locale={locale} coming={coming} asked={asked} />
              </details>
            ) : null}
            <Field label={p.note}>
              <Input name="note" maxLength={300} autoComplete="off" />
            </Field>
            <SubmitButton pendingLabel={p.placing}>{p.place}</SubmitButton>
          </ActionForm>
        )}
      </Section>
    </>
  );
}

function Lines({ items, m, locale, coming, asked }: { items: Item[]; m: Messages; locale: string; coming: Map<string, number>; asked: (id: string) => number | null }) {
  const p = m.orderPage;
  return (
    <ul className="divide-y divide-rule">
      {items.map((i) => {
        const ask = asked(i.item_id);
        const onOrder = coming.get(i.item_id) ?? 0;
        return (
          <li key={i.item_id} className="flex flex-wrap items-center gap-3 py-2">
            <label htmlFor={`q-${i.item_id}`} className="min-w-40 flex-1">
              <span className="block font-semibold">{i.name}</span>
              <span className="block text-sm text-slate">
                {fill(p.inStock, { n: quantityText(i.on_hand, i.unit, locale) })}
                {onOrder > 0 ? `, ${fill(p.onOrderAlready, { n: quantityText(onOrder, i.unit, locale) })}` : ""}
              </span>
            </label>
            <div className="w-32">
              <Input id={`q-${i.item_id}`} name={`q-${i.item_id}`} autoComplete="off" placeholder={m.units[i.unit]} defaultValue={ask === null ? "" : typedQuantity(ask, i.unit)} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
