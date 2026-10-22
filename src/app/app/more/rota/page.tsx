import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { addDays, endsNextDay, formatDate, isISODate, todayIn, weekDays, weekStart } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { workers } from "@/lib/team";
import { addShift, addUsualShifts, changeShift, putOnRota, saveOnSite, setShiftActive, takeOffRota } from "./actions";

export const generateMetadata = () => appTitle((m) => m.rota.title);

/** The rota (M43): a week of shifts and who works them, the shifts themselves, and who lives on site. */
export default function RotaPage({ searchParams }: PageProps<"/app/more/rota">) {
  return (
    <Suspense fallback={<Loading />}>
      <Rota searchParams={searchParams} />
    </Suspense>
  );
}

async function Rota({ searchParams }: Pick<PageProps<"/app/more/rota">, "searchParams">) {
  const query = await searchParams;
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const w = m.rota;
  const title = (
    <PageTitle title={w.title}>
      <Link href="/app/more/leave" className={buttonStyles.quiet}>
        {w.links.leave}
      </Link>
      <Link href="/app/more/attendance" className={buttonStyles.quiet}>
        {w.links.attendance}
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
  const monday = weekStart(isISODate(query.week) ? query.week : today);
  const days = weekDays(monday);
  const supabase = await createClient();
  const [shiftsRes, rotaRes, names, people] = await Promise.all([
    supabase.from("shifts").select("id, name, starts_at, ends_at, is_active").eq("org_id", org.id).order("sort_order").order("starts_at"),
    supabase.from("rota").select("id, shift_id, user_id, work_date").eq("org_id", org.id).gte("work_date", monday).lte("work_date", days[6]).order("created_at"),
    supabase.from("memberships").select("user_id, display_name").eq("org_id", org.id),
    workers(supabase, org.id),
  ]);
  if (shiftsRes.error || rotaRes.error) throw new Error("Could not load the rota.");
  const shifts = shiftsRes.data;
  const rota = rotaRes.data;
  const nameOf = new Map((names.data ?? []).map((n) => [n.user_id, n.display_name]));
  const hours = (s: { starts_at: string; ends_at: string }) =>
    fill(endsNextDay(s.starts_at, s.ends_at) ? w.shifts.hoursNextDay : w.shifts.hours, { from: s.starts_at.slice(0, 5), to: s.ends_at.slice(0, 5) });
  const dayName = (d: string) => new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${d}T00:00:00Z`));
  const onSite = people.filter((p) => p.lives_on_site);
  const active = shifts.filter((s) => s.is_active);

  return (
    <>
      {title}
      <nav aria-label={fill(w.week, { date: formatDate(monday, locale) })} className="mb-4 flex flex-wrap items-center gap-2">
        <p className="w-full text-xl font-bold sm:mr-auto sm:w-auto">{fill(w.week, { date: formatDate(monday, locale) })}</p>
        <Link href={`/app/more/rota?week=${addDays(monday, -7)}`} className={`${buttonStyles.secondary} flex-1 sm:flex-none`}>
          {w.previous}
        </Link>
        {monday !== weekStart(today) ? (
          <Link href="/app/more/rota" className={`${buttonStyles.secondary} flex-1 sm:flex-none`}>
            {w.thisWeek}
          </Link>
        ) : null}
        <Link href={`/app/more/rota?week=${addDays(monday, 7)}`} className={`${buttonStyles.secondary} flex-1 sm:flex-none`}>
          {w.next}
        </Link>
      </nav>
      {onSite.length > 0 ? <p className="mb-4 text-slate">{fill(w.livesOnSite, { names: onSite.map((p) => p.display_name).join(", ") })}</p> : null}
      {canManage ? null : <Notice tone="info">{w.viewOnly}</Notice>}

      {shifts.length === 0 ? (
        <Empty>{canManage ? w.noShifts : w.noShiftsStaff}</Empty>
      ) : (
        <ol className="mb-7 space-y-3">
          {days.map((d) => {
            const shown = shifts.filter((s) => s.is_active || rota.some((r) => r.shift_id === s.id && r.work_date === d));
            return (
              <li key={d} className={`rounded-xl border bg-paper p-4 ${d === today ? "border-ink" : "border-rule"}`}>
                <h2 className="mb-2 text-lg font-bold">{dayName(d)}</h2>
                <dl className="space-y-2">
                  {shown.map((s) => {
                    const on = rota.filter((r) => r.shift_id === s.id && r.work_date === d);
                    return (
                      <div key={s.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <dt className="min-w-40 font-semibold">
                          {s.name} <span className="font-normal text-slate">{hours(s)}</span>
                        </dt>
                        <dd className="flex flex-wrap items-center gap-2">
                          {on.length === 0 ? <span className="text-slate">{w.nobody}</span> : null}
                          {on.map((r) => {
                            const name = nameOf.get(r.user_id) ?? "";
                            return canManage ? (
                              <ActionForm key={r.id} action={takeOffRota} className="contents">
                                <input type="hidden" name="rotaId" value={r.id} />
                                <span className="inline-flex items-center gap-1 rounded-lg bg-ground pl-3">
                                  <span className="font-semibold">{name}</span>
                                  <SubmitButton variant="quiet" pendingLabel={m.common.removing}>
                                    <span aria-hidden="true">{w.takeOff}</span>
                                    <span className="sr-only">{fill(w.takeOffLabel, { name, shift: s.name, date: dayName(d) })}</span>
                                  </SubmitButton>
                                </span>
                              </ActionForm>
                            ) : (
                              <Badge key={r.id}>{name}</Badge>
                            );
                          })}
                        </dd>
                      </div>
                    );
                  })}
                </dl>
              </li>
            );
          })}
        </ol>
      )}

      {canManage && active.length > 0 && people.length > 0 ? (
        <Section title={w.put.title}>
          <ActionForm action={putOnRota} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <Field label={w.put.person}>
              <Select name="userId" required defaultValue="">
                <option value="" disabled>
                  {w.choose}
                </option>
                {people.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.put.shift}>
              <Select name="shiftId" required defaultValue="">
                <option value="" disabled>
                  {w.choose}
                </option>
                {active.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}, {hours(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.put.from}>
              <Input name="from" type="date" required defaultValue={monday > today ? monday : today} />
            </Field>
            <Field label={w.put.to} hint={w.put.toHint}>
              <Input name="to" type="date" defaultValue={monday > today ? monday : today} />
            </Field>
            <SubmitButton pendingLabel={m.common.saving}>{w.put.button}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      <Section title={w.shifts.title} count={shifts.length}>
        <p className="mb-3 text-slate">{w.shifts.about}</p>
        {shifts.length > 0 ? (
          <ul className="mb-4 space-y-2">
            {shifts.map((s) => (
              <li key={s.id} className="rounded-xl border border-rule bg-paper px-4 py-3">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="font-bold">{s.name}</span>
                  <span className="text-slate">{hours(s)}</span>
                  {s.is_active ? null : <Badge tone="attention">{w.shifts.offList}</Badge>}
                </p>
                {canManage ? (
                  <div className="mt-1 flex flex-wrap items-start gap-2">
                    <details className="w-full sm:w-auto">
                      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">
                        {w.shifts.change}
                        <span className="sr-only"> {s.name}</span>
                      </summary>
                      <ActionForm action={changeShift} className="mt-2 grid items-end gap-3 sm:grid-cols-3">
                        <input type="hidden" name="shiftId" value={s.id} />
                        <Field label={w.shifts.starts}>
                          <Input name="starts" type="time" required defaultValue={s.starts_at.slice(0, 5)} />
                        </Field>
                        <Field label={w.shifts.ends}>
                          <Input name="ends" type="time" required defaultValue={s.ends_at.slice(0, 5)} />
                        </Field>
                        <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                          {w.shifts.save}
                        </SubmitButton>
                      </ActionForm>
                    </details>
                    <ActionForm action={setShiftActive} className="contents">
                      <input type="hidden" name="shiftId" value={s.id} />
                      <input type="hidden" name="active" value={s.is_active ? "false" : "true"} />
                      <SubmitButton variant="quiet" pendingLabel={m.common.saving}>
                        {s.is_active ? w.shifts.takeOffList : w.shifts.putBack}
                      </SubmitButton>
                    </ActionForm>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {canManage ? (
          <>
            {shifts.length === 0 ? (
              <ActionForm action={addUsualShifts} className="mb-4">
                <SubmitButton pendingLabel={m.common.adding}>{w.shifts.addUsual}</SubmitButton>
              </ActionForm>
            ) : null}
            <ActionForm action={addShift} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-4">
              <Field label={w.shifts.name}>
                <Input name="name" required maxLength={40} />
              </Field>
              <Field label={w.shifts.starts}>
                <Input name="starts" type="time" required />
              </Field>
              <Field label={w.shifts.ends}>
                <Input name="ends" type="time" required />
              </Field>
              <SubmitButton variant="secondary" pendingLabel={m.common.adding}>
                {w.shifts.add}
              </SubmitButton>
            </ActionForm>
          </>
        ) : null}
      </Section>

      {canManage && people.length > 0 ? (
        <Section title={w.onSite.title}>
          <ActionForm action={saveOnSite} className="space-y-3 rounded-xl border border-rule bg-paper p-4">
            <p className="text-slate">{w.onSite.about}</p>
            <div className="grid gap-1 sm:grid-cols-2">
              {people.map((p) => (
                <label key={p.user_id} className="flex min-h-12 items-center gap-3">
                  <input type="checkbox" name={`site_${p.user_id}`} defaultChecked={p.lives_on_site} className="size-5" />
                  <span>{p.display_name}</span>
                </label>
              ))}
            </div>
            <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
              {w.onSite.save}
            </SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
