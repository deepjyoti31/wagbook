import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { playWindows, toMinutes, yardsNeeded } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n, type I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addYard, savePlayHours, setYardActive } from "./actions";

export const generateMetadata = () => appTitle((m) => m.yards.title);

export default function PlayYardsPage({ searchParams }: PageProps<"/app/more/play">) {
  return (
    <Suspense fallback={<Loading />}>
      <PlayYards searchParams={searchParams} />
    </Suspense>
  );
}

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

async function PlayYards({ searchParams }: Pick<PageProps<"/app/more/play">, "searchParams">) {
  const params = await searchParams;
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const y = m.yards;
  const supabase = await createClient();
  const [yards, kennels] = await Promise.all([
    supabase.from("play_yards").select("id, name, is_active").eq("org_id", org.id).order("sort_order").order("name"),
    supabase.from("kennels").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("is_active", true),
  ]);
  if (yards.error) throw new Error("Could not load yards.");
  const activeYards = yards.data.filter((y) => y.is_active).length;

  return (
    <>
      <PageTitle title={y.title} />
      <p className="mb-5 text-slate">{y.intro}</p>
      {canManage ? null : <Notice tone="info">{y.onlyManagers}</Notice>}

      <Section title={y.yards} count={yards.data.length}>
        {yards.data.length === 0 ? (
          <Empty>{y.none}</Empty>
        ) : (
          <Ledger>
            {yards.data.map((yard) => (
              <LedgerRow key={yard.id}>
                <span className="flex flex-1 items-center gap-2 font-bold">
                  {yard.name}
                  {yard.is_active ? null : <Badge tone="alert">{y.outOfUse}</Badge>}
                </span>
                {canManage ? (
                  <ActionForm action={setYardActive} className="contents">
                    <input type="hidden" name="yardId" value={yard.id} />
                    <input type="hidden" name="active" value={yard.is_active ? "false" : "true"} />
                    <SubmitButton variant="quiet" pendingLabel={m.common.saving}>
                      {yard.is_active ? y.takeOut : y.putBack}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
        {canManage ? (
          <ActionForm action={addYard} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-rule bg-paper p-4">
            <div className="min-w-48 flex-1">
              <Field label={y.name}>
                <Input name="name" required maxLength={40} defaultValue={fill(y.defaultName, { letter: String.fromCharCode(65 + Math.min(yards.data.length, 25)) })} />
              </Field>
            </div>
            <SubmitButton pendingLabel={m.common.adding}>{y.add}</SubmitButton>
          </ActionForm>
        ) : null}
      </Section>

      <Section title={y.howPlayWorks}>
        <ActionForm action={savePlayHours} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={y.sessions} hint={y.sessionsHint}>
              <Input name="sessions" type="number" min={0} max={12} defaultValue={org.play_sessions_per_day} />
            </Field>
            <Field label={y.minutes} hint={y.minutesHint}>
              <Input name="minutes" type="number" min={5} max={240} defaultValue={org.play_session_minutes} />
            </Field>
            <Field label={y.changeover} hint={y.changeoverHint}>
              <Input name="changeover" type="number" min={0} max={60} defaultValue={org.play_changeover_minutes} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={y.open}>
              <Input name="dayStart" type="time" required defaultValue={hm(org.play_day_start)} />
            </Field>
            <Field label={y.close}>
              <Input name="dayEnd" type="time" required defaultValue={hm(org.play_day_end)} />
            </Field>
            <Field label={y.breakStarts} hint={y.breakStartsHint}>
              <Input name="breakStart" type="time" defaultValue={hm(org.play_break_start)} />
            </Field>
            <Field label={y.breakEnds}>
              <Input name="breakEnd" type="time" defaultValue={hm(org.play_break_end)} />
            </Field>
          </div>
          {canManage ? <SubmitButton pendingLabel={m.common.saving}>{y.save}</SubmitButton> : null}
        </ActionForm>
      </Section>

      <Calculator
        t={t}
        params={params}
        defaults={{
          dogs: kennels.count ?? 0,
          sessions: org.play_sessions_per_day || 2,
          minutes: org.play_session_minutes,
          changeover: org.play_changeover_minutes,
          dayStart: hm(org.play_day_start),
          dayEnd: hm(org.play_day_end),
          breakStart: hm(org.play_break_start),
          breakEnd: hm(org.play_break_end),
        }}
        yardsYouHave={activeYards}
      />
    </>
  );
}

type Inputs = { dogs: number; sessions: number; minutes: number; changeover: number; dayStart: string; dayEnd: string; breakStart: string; breakEnd: string };

/** "What do I need": a plain GET form, so it works without JavaScript and the answer can be shared as a link. */
function Calculator({
  t,
  params,
  defaults,
  yardsYouHave,
}: {
  t: I18n;
  params: Record<string, string | string[] | undefined>;
  defaults: Inputs;
  yardsYouHave: number;
}) {
  const c = t.m.yards.calculator;
  const str = (k: keyof Inputs) => (typeof params[k] === "string" ? (params[k] as string) : String(defaults[k]));
  const num = (k: keyof Inputs, lo: number, hi: number) => {
    const n = Number(str(k));
    return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
  };
  const v = {
    dogs: num("dogs", 0, 2000),
    sessions: num("sessions", 1, 12),
    minutes: num("minutes", 5, 240),
    changeover: num("changeover", 0, 60),
    dayStart: str("dayStart"),
    dayEnd: str("dayEnd"),
    breakStart: str("breakStart"),
    breakEnd: str("breakEnd"),
  };

  let answer: { tone: "ok" | "error" | "info"; text: string };
  try {
    if (v.dogs === null || v.sessions === null || v.minutes === null || v.changeover === null) throw new RangeError("numbers");
    const windows = playWindows(v.dayStart, v.dayEnd, v.breakStart || null, v.breakEnd || null);
    for (const w of windows) if (toMinutes(w.end) <= toMinutes(w.start)) throw new RangeError("order");
    const need = yardsNeeded({ dogCount: v.dogs, sessionsPerDog: v.sessions, sessionMinutes: v.minutes, changeoverMinutes: v.changeover, windows });
    const hours = Math.round((v.dogs * v.sessions * (v.minutes + v.changeover)) / 6) / 10;
    if (need === null) answer = { tone: "error", text: c.noFit };
    else
      answer = {
        tone: need <= yardsYouHave ? "ok" : "info",
        text: plural(t.language, need, c.answer, { pets: v.dogs, hours, have: yardsYouHave }),
      };
  } catch {
    answer = { tone: "error", text: c.checkNumbers };
  }

  return (
    <Section title={c.title}>
      <form method="get" className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        <Notice tone={answer.tone}>{answer.text}</Notice>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={c.pets}>
            <Input name="dogs" type="number" min={0} max={2000} defaultValue={str("dogs")} />
          </Field>
          <Field label={c.sessions}>
            <Input name="sessions" type="number" min={1} max={12} defaultValue={str("sessions")} />
          </Field>
          <Field label={c.minutes}>
            <Input name="minutes" type="number" min={5} max={240} defaultValue={str("minutes")} />
          </Field>
          <Field label={c.changeover}>
            <Input name="changeover" type="number" min={0} max={60} defaultValue={str("changeover")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label={c.open}>
            <Input name="dayStart" type="time" defaultValue={str("dayStart")} />
          </Field>
          <Field label={c.close}>
            <Input name="dayEnd" type="time" defaultValue={str("dayEnd")} />
          </Field>
          <Field label={c.breakFrom}>
            <Input name="breakStart" type="time" defaultValue={str("breakStart")} />
          </Field>
          <Field label={c.breakTo}>
            <Input name="breakEnd" type="time" defaultValue={str("breakEnd")} />
          </Field>
        </div>
        <button type="submit" className={buttonStyles.secondary}>
          {c.workItOut}
        </button>
      </form>
    </Section>
  );
}
