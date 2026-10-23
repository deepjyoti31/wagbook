import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { costToExpense } from "@/app/app/day-actions";
import { requireOrg } from "@/lib/auth";
import { formatMoney } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addHouseJob, addUsualHouseJobs, fixRepair, reportRepair, stopHouseJob } from "./actions";

export const generateMetadata = () => appTitle((m) => m.house.title);

export default function HousePage({ searchParams }: PageProps<"/app/more/house">) {
  return (
    <Suspense fallback={<Loading />}>
      <House searchParams={searchParams} />
    </Suspense>
  );
}

const LISTS = ["opening", "closing", "cleaning"] as const;

/** More, Checklists and repairs (M51): the lists owners and managers set, and repairs anyone reports. */
async function House({ searchParams }: Pick<PageProps<"/app/more/house">, "searchParams">) {
  const done = (await searchParams).done;
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const w = m.house;
  const supabase = await createClient();
  const [jobs, repairs, people] = await Promise.all([
    supabase.from("house_jobs").select("id, list, label, weekday, due_time").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("created_at"),
    supabase
      .from("repairs")
      .select("id, what, details, reported_at, reported_by, fixed_at, fixed_by, fixed_note, cost_minor, expense_id")
      .eq("org_id", org.id)
      .order("reported_at", { ascending: false })
      .limit(100),
    supabase.from("memberships").select("user_id, display_name").eq("org_id", org.id),
  ]);
  if (jobs.error || repairs.error) throw new Error("Could not load the checklists and repairs.");
  const name = (id: string | null) => people.data?.find((p) => p.user_id === id)?.display_name ?? "";
  const day = (iso: string) => new Intl.DateTimeFormat(locale, { timeZone: org.time_zone, day: "numeric", month: "short" }).format(new Date(iso));
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const open = repairs.data.filter((r) => !r.fixed_at);
  const fixed = repairs.data.filter((r) => r.fixed_at).slice(0, 20);
  const when = (weekday: number | null) => (weekday ? w.jobs.weekdays[weekday as 1 | 2 | 3 | 4 | 5 | 6 | 7] : w.jobs.everyDay);

  return (
    <>
      <PageTitle title={w.title} />
      {done === "usual" || done === "fixed" || done === "stopped" ? (
        <Notice tone="ok">{done === "usual" ? w.jobs.addedUsual : done === "fixed" ? w.repairs.fixed : w.jobs.stopped}</Notice>
      ) : null}

      <Section title={w.repairs.title} count={open.length}>
        <p className="mb-3 text-slate">{w.repairs.about}</p>
        <ActionForm action={reportRepair} className="mb-4 space-y-4 rounded-xl border border-rule bg-paper p-4">
          <Field label={w.repairs.what} hint={w.repairs.whatHint}>
            <Input name="what" required maxLength={200} />
          </Field>
          <Field label={w.repairs.details}>
            <Input name="details" maxLength={1000} />
          </Field>
          <SubmitButton pendingLabel={w.repairs.reporting}>{w.repairs.report}</SubmitButton>
        </ActionForm>
        {open.length === 0 ? (
          <Empty>{w.repairs.none}</Empty>
        ) : (
          <ul className="space-y-3">
            {open.map((r) => (
              <li key={r.id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="font-bold">{r.what}</p>
                {r.details ? <p className="whitespace-pre-line">{r.details}</p> : null}
                <p className="text-sm text-slate">{fill(w.repairs.reportedBy, { date: day(r.reported_at), name: name(r.reported_by) })}</p>
                <details className="mt-2">
                  <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{w.repairs.fix}</summary>
                  <ActionForm action={fixRepair} className="mt-2 grid items-end gap-3 sm:grid-cols-3">
                    <input type="hidden" name="repairId" value={r.id} />
                    <Field label={w.repairs.cost}>
                      <Input name="cost" inputMode="decimal" autoComplete="off" />
                    </Field>
                    <Field label={w.repairs.note}>
                      <Input name="note" maxLength={300} />
                    </Field>
                    <SubmitButton variant="secondary" pendingLabel={w.repairs.fixing}>
                      {w.repairs.fix}
                    </SubmitButton>
                  </ActionForm>
                </details>
              </li>
            ))}
          </ul>
        )}
        {fixed.length > 0 ? (
          <>
            <h3 className="mb-2 mt-5 font-bold">{w.repairs.recent}</h3>
            <Ledger>
              {fixed.map((r) => (
                <LedgerRow key={r.id}>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{r.what}</span>
                    <span className="block text-sm text-slate">{fill(w.repairs.fixedBy, { date: day(r.fixed_at!), name: name(r.fixed_by) })}</span>
                    {r.fixed_note ? <span className="block text-sm">{r.fixed_note}</span> : null}
                    {r.cost_minor ? <span className="block text-sm tabular-nums">{fill(w.repairs.costLine, { amount: money(r.cost_minor) })}</span> : null}
                  </span>
                  {r.expense_id ? (
                    <Badge tone="good">{w.repairs.onExpenses}</Badge>
                  ) : canManage && r.cost_minor ? (
                    <ActionForm action={costToExpense} className="contents">
                      <input type="hidden" name="kind" value="repair" />
                      <input type="hidden" name="id" value={r.id} />
                      <SubmitButton variant="secondary" pendingLabel={w.repairs.writing}>
                        {w.repairs.toExpense}
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </LedgerRow>
              ))}
            </Ledger>
          </>
        ) : null}
      </Section>

      <Section title={w.jobs.title}>
        <p className="mb-3 text-slate">{w.jobs.about}</p>
        {canManage ? null : <p className="mb-3 text-slate">{w.jobs.managersOnly}</p>}
        {LISTS.map((list) => {
          const mine = jobs.data.filter((j) => j.list === list);
          return (
            <div key={list} className="mb-5">
              <h3 className="mb-2 font-bold">{w.lists[list]}</h3>
              {mine.length === 0 ? (
                <Empty>{w.jobs.none}</Empty>
              ) : (
                <Ledger>
                  {mine.map((j) => (
                    <LedgerRow key={j.id}>
                      <span className="min-w-0 flex-1">
                        <span className="font-semibold">{j.label}</span>
                        <span className="block text-sm text-slate">
                          {[when(j.weekday), j.due_time ? j.due_time.slice(0, 5) : null].filter(Boolean).join(", ")}
                        </span>
                      </span>
                      {canManage ? (
                        <ActionForm action={stopHouseJob} className="contents">
                          <input type="hidden" name="jobId" value={j.id} />
                          <SubmitButton variant="quiet" pendingLabel={w.jobs.stopping}>
                            {w.jobs.stop}
                          </SubmitButton>
                        </ActionForm>
                      ) : null}
                    </LedgerRow>
                  ))}
                </Ledger>
              )}
            </div>
          );
        })}
        {canManage ? (
          <>
            {jobs.data.length === 0 ? (
              <ActionForm action={addUsualHouseJobs} className="mb-4">
                <SubmitButton variant="secondary" pendingLabel={m.common.adding}>
                  {w.jobs.addUsual}
                </SubmitButton>
              </ActionForm>
            ) : null}
            <ActionForm action={addHouseJob} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={w.jobs.list}>
                  <Select name="list" defaultValue="opening">
                    {LISTS.map((l) => (
                      <option key={l} value={l}>
                        {w.lists[l]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={w.jobs.label} hint={w.jobs.labelHint}>
                  <Input name="label" required maxLength={80} />
                </Field>
                <Field label={w.jobs.when}>
                  <Select name="weekday" defaultValue="">
                    <option value="">{w.jobs.everyDay}</option>
                    {([1, 2, 3, 4, 5, 6, 7] as const).map((d) => (
                      <option key={d} value={d}>
                        {w.jobs.weekdays[d]}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={w.jobs.time}>
                  <Input name="time" type="time" />
                </Field>
              </div>
              <SubmitButton pendingLabel={m.common.adding}>{w.jobs.add}</SubmitButton>
            </ActionForm>
          </>
        ) : null}
      </Section>
    </>
  );
}
