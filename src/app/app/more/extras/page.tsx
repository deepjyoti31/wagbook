import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatMoney, toDecimalString } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addExtraService, changeExtraPrice, removeExtraService } from "./actions";

export const generateMetadata = () => appTitle((m) => m.extras.title);

export default function ExtrasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Extras />
    </Suspense>
  );
}

async function Extras() {
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const x = m.extras;
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").select("id, name, unit, price_minor, tax_rate_bp, sac_code").eq("org_id", org.id).eq("kind", "addon").eq("is_active", true).order("sort_order").order("name");
  if (error) throw new Error("Could not load extras.");
  // Rates and codes matter only to a kennel that charges tax (D35).
  const taxed = org.tax_mode !== "none";

  return (
    <>
      <PageTitle title={x.title} />
      <p className="mb-5 text-slate">{x.intro}</p>
      {canManage ? null : <Notice tone="info">{x.viewOnly}</Notice>}

      <Section title={x.yours} count={data.length}>
        {data.length === 0 ? (
          <Empty>{x.empty}</Empty>
        ) : (
          <Ledger>
            {data.map((s) => {
              const price = formatMoney(s.price_minor, { currency: org.currency, locale, trimZeros: true });
              return (
                <LedgerRow key={s.id}>
                  <span className="min-w-0 flex-1">
                    <span className="font-bold">{s.name}</span> <span className="text-slate">{s.unit === "hour" ? fill(x.perHour, { price }) : price}</span>
                    {taxed ? (
                      <span className="block text-sm text-slate">
                        {[s.tax_rate_bp === null ? x.taxUsual : fill(x.taxShown, { rate: s.tax_rate_bp / 100 }), s.sac_code ? fill(x.sacShown, { code: s.sac_code }) : null]
                          .filter(Boolean)
                          .join(". ")}
                      </span>
                    ) : null}
                  </span>
                  {canManage ? (
                    <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                      {taxed ? (
                        <details className="w-full">
                          <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{x.change}</summary>
                          <ActionForm action={changeExtraPrice} className="mt-2 grid gap-3 sm:grid-cols-3">
                            <input type="hidden" name="serviceId" value={s.id} />
                            <Field label={x.price}>
                              <Input name="price" inputMode="decimal" defaultValue={toDecimalString(s.price_minor).replace(/\.00$/, "")} />
                            </Field>
                            <Field label={x.rate} hint={x.rateHint}>
                              <Input name="rate" inputMode="decimal" defaultValue={s.tax_rate_bp === null ? "" : String(s.tax_rate_bp / 100)} />
                            </Field>
                            <Field label={x.sac}>
                              <Input name="sac" inputMode="numeric" maxLength={8} defaultValue={s.sac_code ?? ""} />
                            </Field>
                            <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                              {x.save}
                            </SubmitButton>
                          </ActionForm>
                        </details>
                      ) : (
                        <ActionForm action={changeExtraPrice} className="flex items-end gap-2">
                          <input type="hidden" name="serviceId" value={s.id} />
                          <label className="w-28">
                            <span className="sr-only">{fill(x.newPriceFor, { name: s.name })}</span>
                            <Input name="price" inputMode="decimal" defaultValue={toDecimalString(s.price_minor).replace(/\.00$/, "")} />
                          </label>
                          <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                            {x.changePrice}
                          </SubmitButton>
                        </ActionForm>
                      )}
                      <ActionForm action={removeExtraService} className="contents">
                        <input type="hidden" name="serviceId" value={s.id} />
                        <SubmitButton variant="quiet" pendingLabel={m.common.removing}>
                          {m.common.remove}
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  ) : null}
                </LedgerRow>
              );
            })}
          </Ledger>
        )}
      </Section>

      {canManage ? (
        <Section title={x.add}>
          <ActionForm action={addExtraService} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Field label={x.what}>
                <Input name="name" required maxLength={80} placeholder={x.whatExample} />
              </Field>
            </div>
            <Field label={x.price}>
              <Input name="price" inputMode="decimal" required />
            </Field>
            <Field label={x.charged}>
              <Select name="unit" defaultValue="each">
                <option value="each">{x.each}</option>
                <option value="hour">{x.hour}</option>
              </Select>
            </Field>
            {taxed ? (
              <>
                <Field label={x.rate} hint={x.rateHint}>
                  <Input name="rate" inputMode="decimal" />
                </Field>
                <Field label={x.sac}>
                  <Input name="sac" inputMode="numeric" maxLength={8} />
                </Field>
              </>
            ) : null}
            <SubmitButton pendingLabel={m.common.saving}>{x.addButton}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
