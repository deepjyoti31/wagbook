import Link from "next/link";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Field, Input, Ledger, LedgerRow, Section } from "@/components/ui";
import { markCleaned, markFlowersSent, tickHouseJob } from "@/app/app/day-actions";
import { requireOrg } from "@/lib/auth";
import { formatDate, houseJobsOn, localClock, supplyAmount, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { parentI18n, type I18n } from "@/lib/i18n-server";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * Today's part of Phase 6 (M50 to M57, D52): kennels to clean, the opening
 * and closing checklists, a parent's food or medicine that will not last the
 * stay, and flowers to send. Each says nothing when there is nothing to do.
 */

/** Kennels a pet has left, still to clean (M50). A kennel out of service is not asked about. */
export async function ToClean({ t }: { t: I18n }) {
  const { org } = await requireOrg();
  const w = t.m.cleaning;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("kennel_cleans")
    .select("id, left_at, kennels!inner(name, is_active, sort_order)")
    .eq("org_id", org.id)
    .is("cleaned_at", null)
    .eq("kennels.is_active", true)
    .order("left_at")
    .limit(100);
  if (error || data.length === 0) return null;
  return (
    <Section title={w.title} count={data.length}>
      <p className="mb-3 text-sm text-slate">{w.about}</p>
      <Ledger>
        {data.map((c) => (
          <LedgerRow key={c.id}>
            <span className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <DoorTag name={c.kennels.name} empty={t.m.common.noKennel} />
              <span className="text-slate">{fill(w.left, { time: localClock(c.left_at, org.time_zone) })}</span>
            </span>
            <ActionForm action={markCleaned} className="contents">
              <input type="hidden" name="cleanId" value={c.id} />
              <SubmitButton variant="secondary" pendingLabel={w.cleaning}>
                {w.cleaned}
              </SubmitButton>
            </ActionForm>
          </LedgerRow>
        ))}
      </Ledger>
    </Section>
  );
}

type JobDay = { job_id: string; status: Enums<"task_status"> };

/**
 * The day's house jobs of some lists (M51), with a Done button each: the
 * opening and closing checklists on Today, the cleaning on Care.
 */
export async function HouseJobs({ t, today, lists }: { t: I18n; today: string; lists: Enums<"house_list">[] }) {
  const { org } = await requireOrg();
  const w = t.m.house;
  const supabase = await createClient();
  const [jobs, ticks] = await Promise.all([
    supabase.from("house_jobs").select("id, list, label, weekday, due_time, is_active, sort_order").eq("org_id", org.id).in("list", lists).eq("is_active", true).order("sort_order").order("created_at"),
    supabase.from("house_job_days").select("job_id, status").eq("org_id", org.id).eq("job_date", today),
  ]);
  if (jobs.error || ticks.error) return null;
  const todays = houseJobsOn(jobs.data, today);
  if (todays.length === 0) return null;
  const done = new Set((ticks.data as JobDay[]).filter((d) => d.status === "done").map((d) => d.job_id));

  return (
    <>
      {lists.map((list) => {
        const mine = todays.filter((j) => j.list === list);
        if (mine.length === 0) return null;
        const finished = mine.filter((j) => done.has(j.id)).length;
        return (
          <Section key={list} title={fill(w.count, { list: w.lists[list], done: finished, total: mine.length })}>
            {finished === mine.length ? <p className="mb-2 font-semibold text-leaf">{w.allDone}</p> : null}
            {/* What is left first; the done ones folded away, with Undo. */}
            {mine.some((j) => !done.has(j.id)) ? <JobList t={t} jobs={mine.filter((j) => !done.has(j.id))} done={false} /> : null}
            {finished > 0 ? (
              <details className="mt-2">
                <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold text-slate underline underline-offset-4">
                  {fill(w.doneCount, { n: finished })}
                </summary>
                <JobList t={t} jobs={mine.filter((j) => done.has(j.id))} done />
              </details>
            ) : null}
          </Section>
        );
      })}
    </>
  );
}

/** House jobs with a Done button each, or Undo once done. */
function JobList({ t, jobs, done }: { t: I18n; jobs: { id: string; label: string; due_time: string | null }[]; done: boolean }) {
  const w = t.m.house;
  return (
    <Ledger>
      {jobs.map((j) => (
        <LedgerRow key={j.id}>
          <span className="min-w-0 flex-1">
            {j.due_time ? <span className="font-bold tabular-nums">{j.due_time.slice(0, 5)} </span> : null}
            <span className={done ? "text-slate line-through" : "font-semibold"}>{j.label}</span>
          </span>
          <ActionForm action={tickHouseJob} className="contents">
            <input type="hidden" name="jobId" value={j.id} />
            {done ? <input type="hidden" name="undo" value="1" /> : null}
            {done ? (
              <SubmitButton variant="quiet" pendingLabel={w.undoing}>
                {w.undo}
              </SubmitButton>
            ) : (
              <button type="submit" className={`${buttonStyles.primary} min-w-28`} aria-label={fill(w.tickLabel, { job: j.label })}>
                {w.tick}
              </button>
            )}
          </ActionForm>
        </LedgerRow>
      ))}
    </Ledger>
  );
}

/** Food or medicine from home that will not last the stay (M55), with a message to the parent. */
export async function SuppliesRunningOut({ t }: { t: I18n }) {
  const { org } = await requireOrg();
  const w = t.m.supplies;
  const supabase = await createClient();
  const short = await supabase
    .from("stay_supply_left")
    .select("supply_id, booking_id, kind, label, left_amount, days_left, days_to_go")
    .eq("org_id", org.id)
    .eq("runs_short", true)
    .limit(50);
  if (short.error || !short.data || short.data.length === 0) return null;
  const stays = await supabase
    .from("bookings")
    .select("id, pets(name), clients(full_name, phone)")
    .eq("org_id", org.id)
    .in("id", short.data.map((s) => s.booking_id ?? ""));
  const p = parentI18n(org.parent_language, org.locale);
  return (
    <Section title={w.runningOut} count={short.data.length}>
      <p className="mb-3 text-sm text-slate">{w.runningOutAbout}</p>
      <Ledger>
        {short.data.map((s) => {
          const stay = stays.data?.find((b) => b.id === s.booking_id);
          const pet = stay?.pets?.name ?? "";
          const days = s.days_left ?? 0;
          return (
            <LedgerRow key={s.supply_id}>
              <span className="min-w-0 flex-1">
                <span className="font-bold">{fill(w.runningOutLine, { pet, label: s.label ?? "", days, togo: s.days_to_go ?? 0 })}</span>
                <span className="block text-sm text-slate">
                  {fill(w.leftShort, { left: supplyAmount(s.kind === "medicine" ? "medicine" : "food", s.left_amount ?? 0, w, t.locale) })}
                </span>
              </span>
              <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                {stay?.clients ? (
                  <a
                    href={whatsappLink(
                      fill(p.m.supplies.askMessage, { name: stay.clients.full_name.split(" ")[0], pet, label: s.label ?? "", days, kennel: org.name }),
                      stay.clients.phone,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonStyles.whatsapp}
                  >
                    {w.ask}
                  </a>
                ) : null}
                {s.kind === "food" ? (
                  <Link href={`/app/bookings/${s.booking_id}#extras`} className={buttonStyles.quiet}>
                    {w.useOurs}
                  </Link>
                ) : null}
              </div>
            </LedgerRow>
          );
        })}
      </Ledger>
    </Section>
  );
}

/** Flowers to send to the family of a pet that has passed away (M52), until someone marks them sent. */
export async function FlowersToSend({ t }: { t: I18n }) {
  const { org, canManage } = await requireOrg();
  const w = t.m.passing.flowers;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pets")
    .select("id, name, passed_away_on, client_id, clients(full_name, phone, address, city, postal_code)")
    .eq("org_id", org.id)
    .not("passed_away_on", "is", null)
    .is("flowers_sent_at", null)
    .order("passed_away_on")
    .limit(20);
  if (error || data.length === 0) return null;
  const homes = await supabase
    .from("client_addresses")
    .select("client_id, line, area, postal_code, kind")
    .eq("org_id", org.id)
    .in("client_id", data.map((p) => p.client_id));
  return (
    <Section title={w.title} count={data.length}>
      <ul className="space-y-3">
        {data.map((p) => {
          const home = homes.data?.find((a) => a.client_id === p.client_id && a.kind === "home") ?? homes.data?.find((a) => a.client_id === p.client_id);
          const address = home
            ? [home.line, home.area, home.postal_code].filter(Boolean).join(", ")
            : [p.clients?.address, p.clients?.city, p.clients?.postal_code].filter(Boolean).join(", ");
          return (
            <li key={p.id} className="rounded-xl border border-rule bg-paper p-4">
              <p className="font-bold">{fill(w.line, { parent: p.clients?.full_name ?? "", pet: p.name })}</p>
              <p className="text-sm text-slate">{formatDate(p.passed_away_on!, t.locale)}</p>
              <p className="mt-1 whitespace-pre-line">{address || w.noAddress}</p>
              <ActionForm action={markFlowersSent} className="mt-3 flex flex-wrap items-end gap-2">
                <input type="hidden" name="petId" value={p.id} />
                {canManage ? (
                  <div className="min-w-40 flex-1">
                    <Field label={w.cost} hint={w.costHint}>
                      <Input name="cost" inputMode="decimal" autoComplete="off" />
                    </Field>
                  </div>
                ) : null}
                <SubmitButton variant="secondary" pendingLabel={w.saving}>
                  {w.done}
                </SubmitButton>
              </ActionForm>
            </li>
          );
        })}
      </ul>
    </Section>
  );
}

/** The latest trial day result of each pet (M56), for badges at check-in. */
export async function trialResults(supabase: Awaited<ReturnType<typeof createClient>>, orgId: string, petIds: string[]) {
  if (petIds.length === 0) return new Map<string, { outcome: Enums<"trial_outcome">; note: string | null; on: string }>();
  const { data } = await supabase
    .from("bookings")
    .select("pet_id, start_date, trial_outcome, trial_note")
    .eq("org_id", orgId)
    .eq("is_trial", true)
    .not("trial_outcome", "is", null)
    .in("pet_id", petIds)
    .order("start_date", { ascending: false });
  const latest = new Map<string, { outcome: Enums<"trial_outcome">; note: string | null; on: string }>();
  for (const b of data ?? []) if (!latest.has(b.pet_id) && b.trial_outcome) latest.set(b.pet_id, { outcome: b.trial_outcome, note: b.trial_note, on: b.start_date });
  return latest;
}

/** A trial day's result as a short badge. */
export function TrialBadge({ t, outcome }: { t: I18n; outcome: Enums<"trial_outcome"> }) {
  return <Badge tone={outcome === "settled" ? "good" : outcome === "anxious" ? "attention" : "alert"}>{fill(t.m.trial.short, { outcome: t.m.trial.outcomes[outcome] })}</Badge>;
}
