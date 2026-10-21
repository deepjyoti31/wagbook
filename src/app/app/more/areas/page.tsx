import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatMoney, toDecimalString } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addArea, changeArea, removeArea } from "./actions";

export const generateMetadata = () => appTitle((m) => m.areas.title);

export default function AreasPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Areas />
    </Suspense>
  );
}

async function Areas() {
  const { org, canManage, canDelete } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const a = m.areas;
  const supabase = await createClient();
  const { data, error } = await supabase.from("service_areas").select("id, postal_code, name, delivery_charge_minor").eq("org_id", org.id).order("name").order("postal_code");
  if (error) throw new Error("Could not load areas.");
  const charge = (minor: number | null) =>
    minor === null || minor === 0 ? a.free : fill(a.perDelivery, { amount: formatMoney(minor, { currency: org.currency, locale: t.locale, trimZeros: true }) });
  const plain = (minor: number | null) => (minor === null ? "" : toDecimalString(minor).replace(/\.00$/, ""));

  return (
    <>
      <PageTitle title={a.title} />
      <p className="mb-4 text-slate">{a.about}</p>
      {org.offers_food_delivery ? null : <Notice tone="info">{a.off}</Notice>}

      {canManage ? (
        <Section title={a.add}>
          <ActionForm action={addArea} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
            <Field label={a.pin}>
              <Input name="postalCode" inputMode={org.country_code === "IN" ? "numeric" : "text"} maxLength={10} required autoComplete="off" />
            </Field>
            <Field label={a.name} hint={a.nameHint}>
              <Input name="name" maxLength={80} required />
            </Field>
            <Field label={a.charge} hint={a.chargeHint}>
              <Input name="charge" inputMode="decimal" />
            </Field>
            <SubmitButton pendingLabel={m.common.adding}>{a.addButton}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      <Section title={a.yours} count={data.length}>
        {data.length === 0 ? (
          <Empty>{canManage ? a.emptyManager : a.emptyStaff}</Empty>
        ) : (
          <Ledger>
            {data.map((x) => (
              <LedgerRow key={x.id}>
                <div className="flex-1">
                  <p className="font-bold">
                    {x.name} <span className="font-normal tabular-nums text-slate">{x.postal_code}</span>
                  </p>
                  <p className="text-slate">{charge(x.delivery_charge_minor)}</p>
                </div>
                {canManage ? (
                  <details className="w-full">
                    <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">
                      {m.common.change}
                      <span className="sr-only"> {x.name}</span>
                    </summary>
                    <ActionForm action={changeArea} className="mt-2 grid items-end gap-4 sm:grid-cols-3">
                      <input type="hidden" name="areaId" value={x.id} />
                      <p className="sr-only">{fill(a.changeTitle, { name: x.name })}</p>
                      <Field label={a.pin}>
                        <Input name="postalCode" maxLength={10} required defaultValue={x.postal_code} />
                      </Field>
                      <Field label={a.name}>
                        <Input name="name" maxLength={80} required defaultValue={x.name} />
                      </Field>
                      <Field label={a.charge} hint={a.chargeHint}>
                        <Input name="charge" inputMode="decimal" defaultValue={plain(x.delivery_charge_minor)} />
                      </Field>
                      <SubmitButton pendingLabel={m.common.saving}>{m.common.saveChanges}</SubmitButton>
                    </ActionForm>
                    {canDelete ? (
                      <ActionForm action={removeArea} className="mt-3">
                        <input type="hidden" name="areaId" value={x.id} />
                        <ConfirmStep label={m.common.remove} warning={m.common.cannotUndo} confirm={a.yesRemove} pending={m.common.removing} />
                      </ActionForm>
                    ) : null}
                  </details>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>
    </>
  );
}
