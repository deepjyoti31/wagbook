import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Section } from "@/components/ui";
import { clockIn, clockOut, closeAtShiftEnd } from "@/app/app/more/attendance/actions";
import { requireOrg } from "@/lib/auth";
import { fill } from "@/lib/i18n";
import { formatDate, localClock, localDate, onRotaNow } from "@/lib/core";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { workers } from "@/lib/team";

/**
 * The signed-in person's own clock (M43): on since when, and Clock out; or
 * Clock in. The database stamps the time.
 */
export async function ClockPanel() {
  const { org, user } = await requireOrg();
  const { m } = await getAppI18n();
  const supabase = await createClient();
  const { data } = await supabase
    .from("attendance")
    .select("clocked_in_at")
    .eq("org_id", org.id)
    .eq("user_id", user.id)
    .is("clocked_out_at", null)
    .maybeSingle();
  return (
    <div className="mb-5 flex flex-wrap items-center gap-3 rounded-xl border border-rule bg-paper p-4">
      <p className="min-w-48 flex-1 font-semibold">{data ? fill(m.onNow.since, { time: localClock(data.clocked_in_at, org.time_zone) }) : m.onNow.notOn}</p>
      <ActionForm action={data ? clockOut : clockIn} className="contents">
        <SubmitButton variant={data ? "secondary" : "primary"} pendingLabel={m.common.saving}>
          {data ? m.onNow.clockOut : m.onNow.clockIn}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}

/**
 * Today's "On now" (M43): who is clocked in (names only, for everyone), who
 * is on the rota now but not clocked in, and who lives on site; with the
 * reader's own clock.
 */
export async function OnNow() {
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const w = m.onNow;
  const supabase = await createClient();
  const now = new Date();
  const today = localDate(now, org.time_zone);
  const [on, rota, people, forgotten] = await Promise.all([
    supabase.rpc("who_is_on", { p_org: org.id }),
    // A night shift that began yesterday may still be on.
    supabase.from("rota").select("user_id, starts_at, ends_at").eq("org_id", org.id).gte("work_date", localDate(new Date(now.getTime() - 86_400_000), org.time_zone)).lte("work_date", today),
    workers(supabase, org.id),
    // Stretches still open well after their shift ended (M60), for owners and managers.
    canManage ? supabase.rpc("forgotten_clock_outs", { p_org: org.id }) : Promise.resolve({ data: [], error: null }),
  ]);
  const clockedIn = on.data ?? [];
  const nameOf = new Map(people.map((p) => [p.user_id, p.display_name]));
  const planned = [...new Set(onRotaNow(rota.data ?? [], `${today}T${localClock(now, org.time_zone)}`).map((r) => r.user_id))].filter(
    (id) => !clockedIn.some((c) => c.user_id === id) && nameOf.has(id),
  );
  const onSite = people.filter((p) => p.lives_on_site);
  return (
    <Section title={w.title} count={clockedIn.length}>
      <ClockPanel />
      {(forgotten.data ?? []).length > 0 ? (
        <ul className="mb-4 space-y-2">
          {(forgotten.data ?? []).map((f) => (
            <li key={f.attendance_id} className="flex flex-wrap items-center gap-3 rounded-xl border border-rule bg-marigold-soft p-4">
              <p className="min-w-48 flex-1">
                <span className="block font-semibold">{fill(m.forgotClockOut.line, { name: f.display_name })}</span>
                <span className="block text-sm">
                  {fill(m.forgotClockOut.since, { shift: f.shift_name, time: localClock(f.clocked_in_at, org.time_zone), date: formatDate(localDate(f.clocked_in_at, org.time_zone), locale) })}
                </span>
              </p>
              <ActionForm action={closeAtShiftEnd} className="contents">
                <input type="hidden" name="attendanceId" value={f.attendance_id} />
                <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                  {fill(m.forgotClockOut.button, { time: localClock(f.shift_ended_at, org.time_zone) })}
                </SubmitButton>
              </ActionForm>
            </li>
          ))}
        </ul>
      ) : null}
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-2">
          <span className="font-semibold">{w.clockedIn}:</span>
          {clockedIn.length === 0 ? <span className="text-slate">{w.nobody}</span> : null}
          {clockedIn.map((c) => (
            <Badge key={c.user_id} tone="good">
              {c.display_name}
            </Badge>
          ))}
        </p>
        {planned.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{w.onRota}:</span>
            {planned.map((id) => (
              <Badge key={id} tone="attention">
                {nameOf.get(id)}
              </Badge>
            ))}
          </p>
        ) : null}
        {onSite.length > 0 ? (
          <p className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{w.livesOnSite}:</span>
            {onSite.map((p) => (
              <Badge key={p.user_id}>{p.display_name}</Badge>
            ))}
          </p>
        ) : null}
      </div>
    </Section>
  );
}
