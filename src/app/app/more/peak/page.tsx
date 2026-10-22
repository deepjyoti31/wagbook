import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { Badge, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addPeakPeriod, removePeakPeriod } from "./actions";

export const generateMetadata = () => appTitle((m) => m.peak.title);

export default function PeakPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Peaks />
    </Suspense>
  );
}

async function Peaks() {
  const { org, canManage, canDelete } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const k = m.peak;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("peak_periods")
    .select("id, name, start_date, end_date, no_refund, is_holiday, play_session_minutes")
    .eq("org_id", org.id)
    .gte("end_date", todayIn(org.time_zone))
    .order("start_date");
  if (error) throw new Error("Could not load peak periods.");

  return (
    <>
      <PageTitle title={k.title} />
      <p className="mb-5 text-slate">{k.intro}</p>
      {canManage ? null : <Notice tone="info">{k.viewOnly}</Notice>}

      <Section title={k.comingUp} count={data.length}>
        {data.length === 0 ? (
          <Empty>{k.empty}</Empty>
        ) : (
          <Ledger>
            {data.map((p) => (
              <LedgerRow key={p.id}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{p.name}</span>
                    {p.no_refund ? <Badge tone="attention">{k.noRefund}</Badge> : null}
                    {p.is_holiday ? <Badge>{m.cancelSetup.holidayBadge}</Badge> : null}
                    {p.play_session_minutes ? <Badge>{fill(k.playMinutes, { n: p.play_session_minutes })}</Badge> : null}
                  </span>
                  <span className="block text-slate">
                    {p.end_date === p.start_date
                      ? formatDate(p.start_date, locale)
                      : fill(m.stay.dates, { start: formatDate(p.start_date, locale), end: formatDate(p.end_date, locale) })}
                  </span>
                </span>
                {canDelete ? (
                  <ActionForm action={removePeakPeriod} className="contents">
                    <input type="hidden" name="periodId" value={p.id} />
                    <ConfirmStep label={m.common.remove} warning={m.common.cannotUndo} confirm={m.common.yesDelete} pending={m.common.removing} />
                  </ActionForm>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      {canManage ? (
        <Section title={k.add}>
          <ActionForm action={addPeakPeriod} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <Field label={k.name}>
              <Input name="name" required maxLength={80} placeholder={k.nameExample} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={k.firstDay}>
                <Input name="startDate" type="date" required />
              </Field>
              <Field label={k.lastDay}>
                <Input name="endDate" type="date" required />
              </Field>
            </div>
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" name="noRefund" className="size-5" />
              <span>{k.noRefundRule}</span>
            </label>
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" name="isHoliday" className="size-5" />
              <span>{m.cancelSetup.holiday}</span>
            </label>
            <Field label={k.playLength} hint={k.playLengthHint}>
              <Input name="playMinutes" type="number" min={5} max={240} />
            </Field>
            <SubmitButton pendingLabel={m.common.saving}>{k.addButton}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
