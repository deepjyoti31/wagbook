import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { SellForm } from "@/components/sell-form";
import { CancelSaleForm } from "@/components/stay-shop";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatMoney, reorderList, saleSubtotal, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { percentText, SHOP_KINDS } from "@/lib/kitchen";
import { shopItems, type ShopItem } from "@/lib/shop";
import { createClient } from "@/lib/supabase/server";
import type { Messages } from "@/messages";
import { addShopItem, makeBillForSale, updateShopItem } from "./actions";

export const generateMetadata = () => appTitle((m) => m.shop.title);

export default function ShopPage({ searchParams }: PageProps<"/app/shop">) {
  return (
    <Suspense fallback={<Loading />}>
      <Shop searchParams={searchParams} />
    </Suspense>
  );
}

async function Shop({ searchParams }: Pick<PageProps<"/app/shop">, "searchParams">) {
  const done = (await searchParams).done;
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const s = m.shop;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);
  const [items, onOrder, suppliers, sales] = await Promise.all([
    shopItems(supabase, org.id),
    supabase.from("stock_on_order").select("item_id, on_order").eq("org_id", org.id),
    supabase.from("suppliers").select("id, name, is_active").eq("org_id", org.id).order("name"),
    supabase
      .from("sales")
      .select("id, status, cancel_reason, booking_id, created_at, clients(full_name, is_walk_in), bookings(pets(name)), sale_lines(description, quantity, unit_price_minor, sort_order), invoices(id, status)")
      .eq("org_id", org.id)
      .eq("sold_on", today)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);
  if (!items || onOrder.error || suppliers.error || sales.error) throw new Error("Could not load the shop.");
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const coming = new Map(onOrder.data.map((o) => [o.item_id!, o.on_order ?? 0]));
  const reorder = reorderList(items, coming);
  const supplierOf = new Map(items.map((i) => [i.item_id, i.supplier_id]));
  const charged = org.tax_mode !== "none";

  return (
    <>
      <PageTitle title={s.title}>
        <Link href="/app/kitchen/stock" className={buttonStyles.quiet}>
          {s.links.stock}
        </Link>
        <Link href="/app/more/orders" className={buttonStyles.quiet}>
          {s.links.orders}
        </Link>
      </PageTitle>
      <p className="mb-4 text-slate">{s.about}</p>
      {org.offers_shop ? null : <Notice tone="info">{s.off}</Notice>}
      {done === "sale-cancelled" ? <Notice tone="ok">{s.cancelledOk}</Notice> : null}

      <Section title={s.sellTitle}>
        <p className="mb-2 text-sm text-slate">{s.sellAbout}</p>
        <SellForm items={items} m={m} money={money} />
      </Section>

      <Section title={s.reorder} count={reorder.length}>
        <p className="mb-2 text-sm text-slate">{s.reorderAbout}</p>
        {reorder.length === 0 ? (
          <Empty>{s.reorderNone}</Empty>
        ) : (
          <Ledger>
            {reorder.map((r) => {
              const supplier = supplierOf.get(r.item_id);
              return (
                <LedgerRow key={r.item_id}>
                  <span className="flex-1 font-semibold">{fill(s.reorderLine, { item: r.name, left: r.on_hand, level: r.low_level })}</span>
                  {r.on_order > 0 ? <Badge tone={r.coming ? "good" : "attention"}>{fill(s.onOrder, { n: r.on_order })}</Badge> : null}
                  {canManage && !r.coming ? (
                    <Link href={supplier ? `/app/more/orders/new?supplier=${supplier}` : "/app/more/orders"} className={buttonStyles.secondary}>
                      {s.orderMore}
                    </Link>
                  ) : null}
                </LedgerRow>
              );
            })}
          </Ledger>
        )}
      </Section>

      <Section title={s.soldToday} count={sales.data.filter((x) => x.status === "sold").length}>
        {sales.data.length === 0 ? (
          <Empty>{s.noneToday}</Empty>
        ) : (
          <ul className="space-y-3">
            {sales.data.map((sale) => {
              const lines = [...sale.sale_lines].sort((a, b) => a.sort_order - b.sort_order);
              const who = sale.clients?.is_walk_in ? s.walkIn : (sale.clients?.full_name ?? "");
              const bill = sale.invoices.find((i) => i.status !== "void");
              return (
                <li key={sale.id} className="rounded-xl border border-rule bg-paper p-4">
                  <p className="flex flex-wrap items-center gap-2 font-bold">
                    <span className="flex-1">{who}</span>
                    <span className="tabular-nums">{money(saleSubtotal(lines))}</span>
                  </p>
                  <p className="text-slate">{lines.map((l) => `${l.description} x ${l.quantity}`).join(", ")}</p>
                  {sale.status === "cancelled" ? (
                    <p className="mt-1 text-sm text-alert">{fill(s.cancelled, { reason: sale.cancel_reason ?? "" })}</p>
                  ) : (
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {sale.booking_id ? (
                        <Link href={`/app/bookings/${sale.booking_id}`} className={buttonStyles.quiet}>
                          {fill(s.onStay, { pet: sale.bookings?.pets?.name ?? "" })}
                        </Link>
                      ) : bill ? (
                        <Link href={`/app/bills/${bill.id}`} className={buttonStyles.secondary}>
                          {s.openBill}
                        </Link>
                      ) : (
                        <ActionForm action={makeBillForSale} className="">
                          <input type="hidden" name="saleId" value={sale.id} />
                          <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                            {s.makeBill}
                          </SubmitButton>
                        </ActionForm>
                      )}
                      {canManage && bill?.status !== "issued" ? <CancelSaleForm id={sale.id} m={m} back="/app/shop" /> : null}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={s.forSale} count={items.length}>
        {items.length === 0 ? (
          <Empty>{canManage ? s.nothingForSale : s.nothingForSaleStaff}</Empty>
        ) : (
          <ul className="space-y-3">
            {items.map((i) => (
              <li key={i.item_id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-bold">{i.name}</span>
                  <span className="font-semibold tabular-nums">{fill(s.inStock, { n: i.on_hand })}</span>
                </p>
                <p className="text-sm text-slate">
                  {charged ? fill(s.priceLine, { price: money(i.sell_price_minor), rate: `${percentText(i.sell_tax_rate_bp)}%` }) : fill(s.noTax, { price: money(i.sell_price_minor) })}
                  {i.hsn_code ? `, ${fill(s.hsn, { code: i.hsn_code })}` : ""}
                </p>
                {canManage ? <ChangeItem item={i} m={m} /> : null}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {canManage ? (
        <Section title={s.add}>
          <ActionForm action={addShopItem} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <p className="text-sm text-slate sm:col-span-2">{s.addAbout}</p>
            <Field label={s.name}>
              <Input name="name" required maxLength={80} autoComplete="off" />
            </Field>
            <Field label={s.kind}>
              <Select name="kind" defaultValue="treat">
                {SHOP_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {m.stockKinds[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={s.price}>
              <Input name="price" inputMode="decimal" required autoComplete="off" />
            </Field>
            <Field label={s.taxRate} hint={charged ? undefined : s.taxHint}>
              <Input name="rate" inputMode="decimal" defaultValue={percentText(org.default_tax_rate_bp)} autoComplete="off" />
            </Field>
            <Field label={s.hsnCode}>
              <Input name="hsn" inputMode="numeric" maxLength={8} autoComplete="off" />
            </Field>
            <Field label={s.lowLevel} hint={s.lowLevelHint}>
              <Input name="lowLevel" inputMode="numeric" autoComplete="off" />
            </Field>
            <Field label={s.supplier}>
              <Select name="supplierId" defaultValue="">
                <option value="">{m.stock.noSupplierChoice}</option>
                {suppliers.data
                  .filter((x) => x.is_active)
                  .map((x) => (
                    <option key={x.id} value={x.id}>
                      {x.name}
                    </option>
                  ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel={m.common.adding}>{s.addButton}</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}

/** Change a thing's price, tax, code and reorder level, or stop selling it. */
function ChangeItem({ item, m }: { item: ShopItem; m: Messages }) {
  const s = m.shop;
  return (
    <details className="mt-2">
      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{s.change}</summary>
      <ActionForm action={updateShopItem} className="mt-2 grid gap-3 sm:grid-cols-2">
        <input type="hidden" name="itemId" value={item.item_id} />
        <Field label={s.price}>
          <Input name="price" inputMode="decimal" required defaultValue={String(item.sell_price_minor / 100)} autoComplete="off" />
        </Field>
        <Field label={s.taxRate}>
          <Input name="rate" inputMode="decimal" defaultValue={percentText(item.sell_tax_rate_bp)} autoComplete="off" />
        </Field>
        <Field label={s.hsnCode}>
          <Input name="hsn" inputMode="numeric" maxLength={8} defaultValue={item.hsn_code ?? ""} autoComplete="off" />
        </Field>
        <Field label={s.lowLevel}>
          <Input name="lowLevel" inputMode="numeric" defaultValue={item.low_level === null ? "" : String(item.low_level)} autoComplete="off" />
        </Field>
        <div className="flex flex-wrap gap-2 sm:col-span-2">
          <SubmitButton pendingLabel={m.common.saving}>{s.save}</SubmitButton>
          <SubmitButton variant="quiet" name="intent" value="stop" pendingLabel={m.common.saving}>
            {s.stopSelling}
          </SubmitButton>
        </div>
      </ActionForm>
    </details>
  );
}
