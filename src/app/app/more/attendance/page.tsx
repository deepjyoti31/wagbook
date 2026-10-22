import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { MonthPicker } from "@/components/month-picker";
import { Badge, buttonStyles, Empty, Field, Input, Loading, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { attendanceSheet, formatDate, formatHours, isYearMonth, localClock, monthBounds, todayIn } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { monthAttendance, workers } from "@/lib/team";
import { ClockPanel } from "@/components/on-now";
import { addStretch, changeStretch } from "./actions";

export const generateMetadata = () => appTitle((m) => m.attendance.title);

/** Attendance (M43): clocking in and out, and the month's sheet for pay. Everyone sees their own; owners and managers everyone's. */
export default function AttendancePage({ searchParams }: PageProps<"/app/more/attendance">) {
  return (
    <Suspense fallback={<Loading />}>
      <Attendance searchParams={searchParams} />
    </Suspense>
  );
}

async function Attendance({ searchParams }: Pick<PageProps<"/app/more/attendance">, "searchParams">) {
  const query = await searchParams;
  const { org, user, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, language, locale } = t;
  const w = m.attendance;
  const title = (
    <PageTitle title={w.title}>
      <Link href="/app/more/rota" className={buttonStyles.quiet}>
        {m.onNow.rota}
      </Link>
    </PageTitle>
  );
  if (!org.keeps_rota)
    return (
      <>
        {title}
        <Empty>{w.off}</Empty>
      </>
    );

  const today = todayIn(org.time_zone);
  const month = isYearMonth(query.month) ? query.month : today.slice(0, 7);
  const { first, last } = monthBounds(month);
  const supabase = await createClient();
  const [data, people] = await Promise.all([
    monthAttendance(supabase, { orgId: org.id, userId: user.id, canManage }, first, last),
    canManage ? workers(supabase, org.id) : Promise.resolve([]),
  ]);
  const sheet = attendanceSheet(month, data.people, data.stretches, data.leave, data.rota);
  const clock = (iso: string) => localClock(iso, org.time_zone);

  return (
    <>
      {title}
      <p className="mb-5 text-slate">{w.about}</p>
      <ClockPanel />
      <MonthPicker month={month} href={(x) => `/app/more/attendance?month=${x}`} locale={locale} words={m.common} />

      <Section title={w.sheet}>
        <p className="mb-3 text-sm text-slate">{w.sheetAbout}</p>
        {sheet.every((r) => r.daysWorked === 0 && r.leaveDays === 0 && r.rotaShifts === 0) ? <Empty>{w.nothing}</Empty> : null}
        <ul className="space-y-3">
          {sheet
            .filter((r) => r.daysWorked > 0 || r.leaveDays > 0 || r.rotaShifts > 0)
            .map((r) => {
              const days = r.days.filter((d) => d.stretches > 0 || d.onLeave);
              return (
                <li key={r.person.user_id} className="rounded-xl border border-rule bg-paper p-4">
                  <p className="flex flex-wrap items-center gap-2">
                    <span className="text-lg font-bold">{r.person.display_name}</span>
                    {r.open > 0 ? <Badge tone="attention">{plural(language, r.open, w.open)}</Badge> : null}
                  </p>
                  <p className="text-slate">
                    {fill(w.summary, { days: r.daysWorked, hours: formatHours(r.minutes), leave: r.leaveDays, shifts: r.rotaShifts })}
                  </p>
                  {days.length > 0 ? (
                    <details className="mt-2">
                      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">
                        {w.dayByDay}
                        <span className="sr-only"> {r.person.display_name}</span>
                      </summary>
                      <ul className="mt-2 divide-y divide-rule">
                        {days.map((d) => (
                          <li key={d.date} className="py-2">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-semibold">{formatDate(d.date, locale)}</span>
                              {d.minutes > 0 ? <span className="tabular-nums">{formatHours(d.minutes)}</span> : null}
                              {d.onLeave ? <Badge tone="good">{w.onLeave}</Badge> : null}
                            </p>
                            {data.stretches
                              .filter((s) => s.user_id === r.person.user_id && s.work_date === d.date)
                              .map((s) => (
                                <div key={s.id} className="mt-1">
                                  <p className="text-slate">
                                    {s.clocked_out_at ? fill(w.stretch, { in: clock(s.clocked_in_at), out: clock(s.clocked_out_at) }) : fill(w.stillOn, { in: clock(s.clocked_in_at) })}
                                    {s.note ? ` · ${fill(w.byHandNote, { note: s.note })}` : null}
                                  </p>
                                  {canManage ? (
                                    <details>
                                      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{w.change}</summary>
                                      <ActionForm action={changeStretch} className="mt-2 grid items-end gap-3 sm:grid-cols-2">
                                        <input type="hidden" name="stretchId" value={s.id} />
                                        <input type="hidden" name="day" value={s.work_date} />
                                        <Field label={w.byHand.in}>
                                          <Input name="in" type="time" required defaultValue={clock(s.clocked_in_at)} />
                                        </Field>
                                        <Field label={w.byHand.out} hint={w.byHand.outHint}>
                                          <Input name="out" type="time" defaultValue={s.clocked_out_at ? clock(s.clocked_out_at) : ""} />
                                        </Field>
                                        <div className="sm:col-span-2">
                                          <Field label={w.byHand.note}>
                                            <Input name="note" required maxLength={300} defaultValue={s.note ?? ""} />
                                          </Field>
                                        </div>
                                        <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                                          {w.byHand.button}
                                        </SubmitButton>
                                      </ActionForm>
                                    </details>
                                  ) : null}
                                </div>
                              ))}
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}
                </li>
              );
            })}
        </ul>
        <p className="mt-4">
          <a href={`/app/more/attendance/download?month=${month}`} download className={buttonStyles.secondary}>
            {w.download}
          </a>
        </p>
      </Section>

      {canManage && people.length > 0 ? (
        <Section title={w.byHand.title}>
          <ActionForm action={addStretch} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <p className="text-slate sm:col-span-2">{w.byHand.about}</p>
            <Field label={w.byHand.person}>
              <Select name="userId" required defaultValue="">
                <option value="" disabled>
                  {m.rota.choose}
                </option>
                {people.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.byHand.day}>
              <Input name="day" type="date" required max={today} defaultValue={today} />
            </Field>
            <Field label={w.byHand.in}>
              <Input name="in" type="time" required />
            </Field>
            <Field label={w.byHand.out} hint={w.byHand.outHint}>
              <Input name="out" type="time" />
            </Field>
            <div className="sm:col-span-2">
              <Field label={w.byHand.note}>
                <Input name="note" required maxLength={300} />
              </Field>
            </div>
            <SubmitButton pendingLabel={m.common.saving}>{w.byHand.button}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
