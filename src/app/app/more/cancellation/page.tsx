import Link from "next/link";
import { Suspense, type ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Loading, Notice, PageTitle, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { CANCEL_OUTCOMES, DEFAULT_CANCEL_RULE, type CancelRule } from "@/lib/core";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { saveCancellationRules } from "./actions";

export const generateMetadata = () => appTitle((m) => m.cancelSetup.title);

/** The kennel's cancellation rules and how long credit lasts (M38). */
export default function CancellationPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Rules />
    </Suspense>
  );
}

function Group({ title, about, children }: { title: string; about?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-4">
      <legend className="px-1 text-lg font-bold">{title}</legend>
      {about ? <p className="text-slate">{about}</p> : null}
      {children}
    </fieldset>
  );
}

const FIELDS = ["weekdayOnTime", "weekdayLate", "weekendOnTime", "weekendLate"] as const;
const COLUMN = { weekdayOnTime: "weekday_on_time", weekdayLate: "weekday_late", weekendOnTime: "weekend_on_time", weekendLate: "weekend_late" } as const;

async function Rules() {
  const { org, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  const w = m.cancelSetup;
  const supabase = await createClient();
  const { data, error } = await supabase.from("cancellation_rules").select("applies_to, notice_hours, weekday_on_time, weekday_late, weekend_on_time, weekend_late").eq("org_id", org.id);
  if (error) throw new Error("Could not load the cancellation rules.");
  const ruleFor = (kind: "boarding" | "daycare"): CancelRule => data.find((r) => r.applies_to === kind) ?? DEFAULT_CANCEL_RULE;

  return (
    <>
      <PageTitle title={w.title} />
      <p className="mb-5 text-slate">{w.about}</p>
      {canManage ? null : <Notice tone="info">{w.viewOnly}</Notice>}
      <ActionForm action={saveCancellationRules} className="space-y-6">
        <Group title={w.weekend} about={w.weekendHint}>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
              <label key={d} className="flex min-h-12 items-center gap-3">
                <input type="checkbox" name="weekend" value={d} defaultChecked={org.weekend_days.includes(d)} className="size-5" />
                <span>{w.days[d]}</span>
              </label>
            ))}
          </div>
          <Link href="/app/more/peak" className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
            {w.holidaysLink}
          </Link>
        </Group>

        {(["boarding", "daycare"] as const).map((kind) => {
          const rule = ruleFor(kind);
          return (
            <Group key={kind} title={w.kinds[kind]}>
              <Field label={w.noticeHours} hint={w.noticeHoursHint}>
                <Input name={`${kind}.hours`} type="number" min={0} max={720} required defaultValue={rule.notice_hours} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                {FIELDS.map((f) => (
                  <Field key={f} label={w[f]}>
                    <Select name={`${kind}.${f}`} defaultValue={rule[COLUMN[f]]}>
                      {CANCEL_OUTCOMES.map((o) => (
                        <option key={o} value={o}>
                          {w.outcomes[o]}
                        </option>
                      ))}
                    </Select>
                  </Field>
                ))}
              </div>
            </Group>
          );
        })}

        <Group title={w.credit}>
          <Field label={w.creditMonths} hint={w.creditMonthsHint}>
            <Input name="creditMonths" type="number" min={1} max={60} required defaultValue={org.credit_months} />
          </Field>
        </Group>

        {canManage ? <SubmitButton pendingLabel={m.common.saving}>{w.save}</SubmitButton> : null}
      </ActionForm>
    </>
  );
}
