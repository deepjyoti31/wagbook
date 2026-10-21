import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PhotoInput } from "@/components/photo-input";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatPhone, isLow, lotsLeft, todayIn, usingSoon, type StockMove } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { quantityText, STOCK_KINDS, STOCK_UNITS, WASTE_REASONS } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import { addItem, addSupplier, recordCount, recordPurchase, recordWaste } from "./actions";

export const generateMetadata = () => appTitle((m) => m.stock.title);

export default function StockPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Stock />
    </Suspense>
  );
}

async function Stock() {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const s = m.stock;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);
  const [levels, moves, suppliers] = await Promise.all([
    supabase.from("stock_levels").select("item_id, name, unit, kind, supplier_id, low_level, never_in_recipe, is_active, on_hand").eq("org_id", org.id).order("name"),
    supabase.from("stock_moves").select("id, item_id, kind, quantity, happened_on, use_by, created_at").eq("org_id", org.id).order("happened_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000),
    supabase.from("suppliers").select("id, name, phone, supplies, is_active").eq("org_id", org.id).order("name"),
  ]);
  if (levels.error || moves.error || suppliers.error) throw new Error("Could not load stock.");
  // A view's columns come back as possibly empty; each row here is a real item.
  const all = levels.data.map((i) => ({ ...i, item_id: i.item_id!, name: i.name!, unit: i.unit!, kind: i.kind!, on_hand: i.on_hand ?? 0 }));
  const items = all.filter((i) => i.is_active);
  const nameOf = new Map(all.map((i) => [i.item_id, i]));

  // What is left of each purchase, soonest to go off first.
  const soon = items
    .flatMap((i) =>
      usingSoon(lotsLeft(moves.data.filter((mv) => mv.item_id === i.item_id) as StockMove[]), today).map((lot) => ({ item: i, lot })),
    )
    .sort((a, b) => (a.lot.use_by ?? "").localeCompare(b.lot.use_by ?? ""));

  const itemSelect = (
    <Select name="itemId" required defaultValue="">
      <option value="" disabled>
        {s.item}
      </option>
      {items.map((i) => (
        <option key={i.item_id} value={i.item_id}>
          {i.name} ({m.units[i.unit]})
        </option>
      ))}
    </Select>
  );

  return (
    <>
      <PageTitle title={s.title}>
        <Link href="/app/kitchen" className={buttonStyles.quiet}>
          {m.kitchen.title}
        </Link>
      </PageTitle>
      <p className="mb-4 text-slate">{s.about}</p>
      {org.offers_kitchen ? null : <Notice tone="info">{m.kitchen.off}</Notice>}

      <Section title={s.useSoon} count={soon.length}>
        <p className="mb-2 text-sm text-slate">{s.useSoonAbout}</p>
        {soon.length === 0 ? (
          <Empty>{s.nothingSoon}</Empty>
        ) : (
          <Ledger>
            {soon.map(({ item, lot }, n) => (
              <LedgerRow key={`${item.item_id}-${n}`}>
                <span className={lot.use_by! < today ? "font-bold text-alert" : "font-semibold"}>
                  {fill(s.useSoonLine, { item: item.name, left: quantityText(lot.left, item.unit, locale), date: formatDate(lot.use_by!, locale) })}
                </span>
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      <Section title={s.inStock} count={items.length}>
        {items.length === 0 ? (
          <Empty>{canManage ? s.empty : s.emptyStaff}</Empty>
        ) : (
          <Ledger>
            {items.map((i) => (
              <LedgerRow key={i.item_id}>
                <div className="flex-1">
                  <p className="font-bold">{i.name}</p>
                  <p className="text-sm text-slate">
                    {m.stockKinds[i.kind]}
                    {i.low_level !== null ? `, ${fill(s.lowLevel, { level: quantityText(i.low_level, i.unit, locale) })}` : ""}
                  </p>
                </div>
                <span className="flex flex-wrap items-center gap-2">
                  {isLow(i.on_hand, i.low_level) ? <Badge tone="attention">{s.low}</Badge> : null}
                  {i.never_in_recipe ? <Badge tone="alert">{s.neverInRecipe}</Badge> : null}
                  <span className="font-bold tabular-nums">{quantityText(i.on_hand, i.unit, locale)}</span>
                </span>
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      {items.length > 0 && canManage ? (
        <Section title={s.buy}>
          <ActionForm action={recordPurchase} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <p className="text-sm text-slate sm:col-span-2">{s.buyAbout}</p>
            <Field label={s.item}>{itemSelect}</Field>
            <Field label={s.quantity} hint={s.quantityHint}>
              <Input name="quantity" required autoComplete="off" />
            </Field>
            <Field label={s.cost}>
              <Input name="cost" inputMode="decimal" required autoComplete="off" />
            </Field>
            <Field label={s.boughtOn}>
              <Input name="on" type="date" defaultValue={today} max={today} required />
            </Field>
            <Field label={s.useBy}>
              <Input name="useBy" type="date" min={today} />
            </Field>
            <Field label={s.supplier}>
              <Select name="supplierId" defaultValue="">
                <option value="">{s.noSupplierChoice}</option>
                {suppliers.data.filter((x) => x.is_active).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={s.billNumber}>
              <Input name="billNumber" maxLength={40} autoComplete="off" />
            </Field>
            <div className="sm:col-span-2">
              <PhotoInput name="bill" label={s.billPhoto} accept="image/*,application/pdf" words={m.photos} />
            </div>
            <label className="flex min-h-12 items-center gap-3 sm:col-span-2">
              <input type="checkbox" name="asExpense" defaultChecked className="size-5" />
              <span>{s.asExpense}</span>
            </label>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel={m.common.saving}>{s.recordBuy}</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      ) : null}

      {items.length > 0 ? (
        <>
          <Section title={s.out}>
            <ActionForm action={recordWaste} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
              <Field label={s.item}>{itemSelect}</Field>
              <Field label={s.quantity} hint={s.quantityHint}>
                <Input name="quantity" required autoComplete="off" />
              </Field>
              <Field label={s.reason}>
                <Select name="reason" required defaultValue="spoiled">
                  {WASTE_REASONS.map((r) => (
                    <option key={r} value={r}>
                      {m.wasteReasons[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={m.kitchen.note}>
                <Input name="note" maxLength={300} autoComplete="off" />
              </Field>
              <input type="hidden" name="on" value={today} />
              <div className="sm:col-span-2">
                <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                  {s.recordWaste}
                </SubmitButton>
              </div>
            </ActionForm>
          </Section>

          <Section title={s.count}>
            <ActionForm action={recordCount} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
              <p className="text-sm text-slate sm:col-span-2">{s.countAbout}</p>
              <Field label={s.item}>{itemSelect}</Field>
              <Field label={s.counted} hint={s.quantityHint}>
                <Input name="counted" required autoComplete="off" />
              </Field>
              <input type="hidden" name="on" value={today} />
              <div className="sm:col-span-2">
                <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                  {s.recordCount}
                </SubmitButton>
              </div>
            </ActionForm>
          </Section>

          <Section title={s.moves}>
            <Ledger>
              {moves.data.slice(0, 20).map((mv) => {
                const item = nameOf.get(mv.item_id);
                return (
                  <LedgerRow key={mv.id}>
                    <span className="flex-1">
                      <span className="font-semibold">{item?.name}</span>{" "}
                      {fill(s.moveLine, {
                        date: formatDate(mv.happened_on, locale),
                        kind: s.moveKinds[mv.kind],
                        quantity: `${mv.quantity > 0 ? "+" : ""}${quantityText(mv.quantity, item?.unit ?? "g", locale)}`,
                      })}
                    </span>
                  </LedgerRow>
                );
              })}
            </Ledger>
          </Section>
        </>
      ) : null}

      {canManage ? (
        <Section title={s.addItem}>
          <ActionForm action={addItem} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <Field label={s.itemName}>
              <Input name="name" required maxLength={80} autoComplete="off" />
            </Field>
            <Field label={s.unit}>
              <Select name="unit" defaultValue="g">
                {STOCK_UNITS.map((u) => (
                  <option key={u} value={u}>
                    {m.units[u]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={s.kind}>
              <Select name="kind" defaultValue="meat">
                {STOCK_KINDS.map((k) => (
                  <option key={k} value={k}>
                    {m.stockKinds[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={s.supplier}>
              <Select name="supplierId" defaultValue="">
                <option value="">{s.noSupplierChoice}</option>
                {suppliers.data.filter((x) => x.is_active).map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={s.lowLevelField} hint={s.lowLevelHint}>
              <Input name="lowLevel" autoComplete="off" />
            </Field>
            <label className="flex min-h-12 items-center gap-3 self-end">
              <input type="checkbox" name="never" className="size-5" />
              <span>{s.never}</span>
            </label>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel={m.common.adding}>{s.addItemButton}</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      ) : null}

      <Section title={s.suppliers} count={suppliers.data.length}>
        {suppliers.data.length === 0 ? (
          <Empty>{s.noSuppliers}</Empty>
        ) : (
          <Ledger>
            {suppliers.data.map((x) => (
              <LedgerRow key={x.id}>
                <div className="flex-1">
                  <p className="font-bold">{x.name}</p>
                  {x.supplies ? <p className="text-sm text-slate">{x.supplies}</p> : null}
                </div>
                {x.phone ? (
                  <a href={`tel:${x.phone}`} className="inline-flex min-h-12 items-center underline underline-offset-4">
                    {formatPhone(x.phone)}
                  </a>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
        {canManage ? (
          <ActionForm action={addSupplier} className="mt-3 grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
            <Field label={s.supplierName}>
              <Input name="name" required maxLength={80} autoComplete="off" />
            </Field>
            <Field label={s.supplierPhone}>
              <Input name="phone" type="tel" autoComplete="off" />
            </Field>
            <Field label={s.supplies}>
              <Input name="supplies" maxLength={200} autoComplete="off" />
            </Field>
            <div className="sm:col-span-3">
              <SubmitButton variant="secondary" pendingLabel={m.common.adding}>
                {s.addSupplierButton}
              </SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </Section>
    </>
  );
}
