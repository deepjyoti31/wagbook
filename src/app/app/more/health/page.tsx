import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addRequiredVaccine, removeRequiredVaccine, saveHealthRules } from "./actions";

export const generateMetadata = () => appTitle((m) => m.healthSetup.title);

/** What a pet needs to come in (M40): the vaccines, deworming, tick treatment and neutering, and whether the door refuses or warns. */
export default function HealthPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Health />
    </Suspense>
  );
}

async function Health() {
  const { org, canManage, canDelete } = await requireOrg();
  const { m } = await getAppI18n();
  const w = m.healthSetup;
  const supabase = await createClient();
  const { data, error } = await supabase.from("required_vaccines").select("id, vaccine, months_valid").eq("org_id", org.id).order("vaccine");
  if (error) throw new Error("Could not load the health rules.");

  return (
    <>
      <PageTitle title={w.title} />
      <p className="mb-5 text-slate">{w.about}</p>
      {canManage ? null : <Notice tone="info">{w.viewOnly}</Notice>}

      <Section title={w.rules}>
        <ActionForm action={saveHealthRules} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <Field label={w.mode}>
            <Select name="mode" defaultValue={org.health_check}>
              {(["off", "warn", "refuse"] as const).map((x) => (
                <option key={x} value={x}>
                  {w.modes[x]}
                </option>
              ))}
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={w.dewormDays} hint={w.emptyHint}>
              <Input name="dewormDays" type="number" min={1} max={730} defaultValue={org.deworm_days ?? ""} />
            </Field>
            <Field label={w.tickDays} hint={w.emptyHint}>
              <Input name="tickDays" type="number" min={1} max={730} defaultValue={org.tick_days ?? ""} />
            </Field>
            <Field label={w.neuterMonths} hint={w.emptyHint}>
              <Input name="neuterMonths" type="number" min={1} max={120} defaultValue={org.neuter_months ?? ""} />
            </Field>
          </div>
          {canManage ? <SubmitButton pendingLabel={m.common.saving}>{w.save}</SubmitButton> : null}
        </ActionForm>
      </Section>

      <Section title={w.vaccines} count={data.length}>
        <p className="mb-3 text-slate">{w.vaccinesAbout}</p>
        {data.length === 0 ? (
          <Empty>{w.vaccinesNone}</Empty>
        ) : (
          <Ledger>
            {data.map((v) => (
              <LedgerRow key={v.id}>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{v.vaccine}</span>
                  <span className="block text-slate">{fill(w.monthsLine, { months: v.months_valid })}</span>
                </span>
                {canDelete ? (
                  <ActionForm action={removeRequiredVaccine} className="contents">
                    <input type="hidden" name="vaccineId" value={v.id} />
                    <ConfirmStep label={m.common.remove} warning={m.common.cannotUndo} confirm={m.common.yesDelete} pending={m.common.removing} />
                  </ActionForm>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
        {canManage ? (
          <ActionForm action={addRequiredVaccine} className="mt-4 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
            <Field label={w.vaccine}>
              <Input name="vaccine" required maxLength={60} placeholder={w.vaccineExample} />
            </Field>
            <Field label={w.monthsValid}>
              <Input name="months" type="number" min={1} max={60} required defaultValue={12} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel={m.common.adding}>
              {w.add}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </Section>
    </>
  );
}
