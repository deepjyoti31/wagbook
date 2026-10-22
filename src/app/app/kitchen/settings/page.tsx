import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatKg, formatMoney } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { FOOD_PRODUCT_KINDS, percentText } from "@/lib/kitchen";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { addFoodProduct, saveKitchenSettings, stopFoodProduct } from "./actions";

export const generateMetadata = () => appTitle((m) => m.kitchenSettings.title);

export default function KitchenSettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <KitchenSettings />
    </Suspense>
  );
}

async function KitchenSettings() {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const k = m.kitchenSettings;
  const supabase = await createClient();
  const [products, origin] = await Promise.all([
    supabase.from("food_products").select("id, kind, name, price_minor, trial_grams, tax_rate_bp, sac_code").eq("org_id", org.id).eq("is_active", true).order("kind").order("name"),
    siteOrigin(),
  ]);
  if (products.error) throw new Error("Could not load food prices.");
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const priceText = (p: (typeof products.data)[number]) =>
    p.kind === "trial"
      ? fill(k.trialPrice, { amount: money(p.price_minor), grams: `${formatKg(p.trial_grams ?? 0, locale)} kg` })
      : p.kind === "item"
        ? fill(k.perPiece, { amount: money(p.price_minor) })
        : fill(k.perKg, { amount: money(p.price_minor) });
  const kg = (g: number) => String(g / 1000);

  return (
    <>
      <PageTitle title={k.title}>
        <Link href="/app/kitchen" className={buttonStyles.quiet}>
          {m.kitchen.title}
        </Link>
      </PageTitle>
      <p className="mb-4 text-slate">{k.about}</p>
      {canManage ? null : <Notice tone="info">{k.errors.managers}</Notice>}

      <Section title={k.prices}>
        <p className="mb-3 text-sm text-slate">{k.pricesAbout}</p>
        {products.data.length === 0 ? (
          <Empty>{k.noPrices}</Empty>
        ) : (
          <Ledger>
            {products.data.map((p) => (
              <LedgerRow key={p.id}>
                <div className="flex-1">
                  <p className="font-bold">{fill(k.priceLine, { name: p.name, price: priceText(p) })}</p>
                  <p className="text-sm text-slate">
                    {k.kinds[p.kind]}
                    {p.tax_rate_bp !== null ? `, ${percentText(p.tax_rate_bp)}%` : ""}
                    {p.sac_code ? `, ${p.sac_code}` : ""}
                  </p>
                </div>
                {canManage ? (
                  <ActionForm action={stopFoodProduct} className="contents">
                    <input type="hidden" name="productId" value={p.id} />
                    <SubmitButton variant="quiet" pendingLabel={m.common.saving}>
                      {k.stopSelling}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
        {canManage ? (
          <ActionForm action={addFoodProduct} className="mt-3 grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <p className="font-bold sm:col-span-2">{k.addPrice}</p>
            <Field label={k.kind}>
              <Select name="kind" defaultValue="subscription">
                {FOOD_PRODUCT_KINDS.map((x) => (
                  <option key={x} value={x}>
                    {k.kinds[x]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={k.name}>
              <Input name="name" required maxLength={80} autoComplete="off" />
            </Field>
            <Field label={k.price}>
              <Input name="price" inputMode="decimal" required autoComplete="off" />
            </Field>
            <Field label={k.trialGrams}>
              <Input name="trialKg" inputMode="decimal" autoComplete="off" />
            </Field>
            <Field label={k.tax}>
              <Input name="tax" inputMode="decimal" autoComplete="off" />
            </Field>
            <Field label={k.code}>
              <Input name="code" inputMode="numeric" maxLength={8} autoComplete="off" />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel={m.common.adding}>{k.addPriceButton}</SubmitButton>
            </div>
          </ActionForm>
        ) : null}
      </Section>

      {canManage ? (
        <ActionForm action={saveKitchenSettings} className="space-y-6">
          <Section title={k.portions}>
            <div className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
              <Field label={k.small}>
                <Input name="small" inputMode="decimal" required defaultValue={percentText(org.portion_small_bp)} />
              </Field>
              <Field label={k.medium}>
                <Input name="medium" inputMode="decimal" required defaultValue={percentText(org.portion_medium_bp)} />
              </Field>
              <Field label={k.large}>
                <Input name="large" inputMode="decimal" required defaultValue={percentText(org.portion_large_bp)} />
              </Field>
              <Field label={k.smallMax}>
                <Input name="smallMax" inputMode="decimal" required defaultValue={kg(org.small_dog_max_g)} />
              </Field>
              <Field label={k.mediumMax}>
                <Input name="mediumMax" inputMode="decimal" required defaultValue={kg(org.medium_dog_max_g)} />
              </Field>
              <Field label={k.topper}>
                <Input name="topper" inputMode="decimal" required defaultValue={percentText(org.topper_share_bp)} />
              </Field>
              <Field label={k.goal}>
                <Input name="goal" inputMode="decimal" required defaultValue={percentText(org.goal_change_bp)} />
              </Field>
            </div>
          </Section>
          <Section title={k.packing}>
            <div className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
              <Field label={k.pack}>
                <Input name="pack" inputMode="numeric" required defaultValue={org.food_pack_g} />
              </Field>
              <Field label={k.cutoff}>
                <Input name="cutoff" inputMode="numeric" required defaultValue={org.food_cutoff_hours} />
              </Field>
              <Field label={k.monthly}>
                <Input name="monthly" inputMode="decimal" required defaultValue={percentText(org.monthly_food_discount_bp)} />
              </Field>
              <Field label={k.margin}>
                <Input name="margin" inputMode="decimal" required defaultValue={percentText(org.cook_margin_bp)} />
              </Field>
              <Field label={k.window}>
                <Input name="window" inputMode="numeric" required defaultValue={org.problem_window_hours} />
              </Field>
              <label className="flex min-h-12 items-start gap-3 sm:col-span-3">
                <input type="checkbox" name="orders" defaultChecked={org.food_orders_enabled} className="mt-1 size-5" />
                <span>
                  {k.orders}
                  <span className="block break-all text-sm text-slate">{fill(k.ordersHint, { url: `${origin}/f/${org.slug}` })}</span>
                </span>
              </label>
            </div>
          </Section>
          <SubmitButton pendingLabel={m.common.saving}>{m.common.saveChanges}</SubmitButton>
        </ActionForm>
      ) : null}
    </>
  );
}
