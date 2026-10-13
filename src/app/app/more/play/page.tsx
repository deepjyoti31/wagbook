import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { playWindows, toMinutes, yardsNeeded } from "@/lib/core";
import { createClient } from "@/lib/supabase/server";
import { addYard, savePlayHours, setYardActive } from "./actions";

export const metadata: Metadata = { title: "Play yards" };

export default function PlayYardsPage({ searchParams }: PageProps<"/app/more/play">) {
  return (
    <>
      <PageTitle title="Play yards" />
      <Suspense fallback={<Loading label="Loading play settings" />}>
        <PlayYards searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const hm = (t: string | null) => (t ? t.slice(0, 5) : "");

async function PlayYards({ searchParams }: Pick<PageProps<"/app/more/play">, "searchParams">) {
  const params = await searchParams;
  const { org, canManage } = await requireOrg();
  const supabase = await createClient();
  const [yards, kennels] = await Promise.all([
    supabase.from("play_yards").select("id, name, is_active").eq("org_id", org.id).order("sort_order").order("name"),
    supabase.from("kennels").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("is_active", true),
  ]);
  if (yards.error) throw new Error("Could not load yards.");
  const activeYards = yards.data.filter((y) => y.is_active).length;

  return (
    <>
      <p className="mb-5 text-slate">For kennels where every pet gets a yard to itself. One pet in a yard at a time; Wagbook refuses anything else.</p>
      {canManage ? null : <Notice tone="info">Only an owner or manager can change play settings.</Notice>}

      <Section title="Yards" count={yards.data.length}>
        {yards.data.length === 0 ? (
          <Empty>No yards yet.</Empty>
        ) : (
          <Ledger>
            {yards.data.map((y) => (
              <LedgerRow key={y.id}>
                <span className="flex flex-1 items-center gap-2 font-bold">
                  {y.name}
                  {y.is_active ? null : <Badge tone="alert">Out of use</Badge>}
                </span>
                {canManage ? (
                  <ActionForm action={setYardActive} className="contents">
                    <input type="hidden" name="yardId" value={y.id} />
                    <input type="hidden" name="active" value={y.is_active ? "false" : "true"} />
                    <SubmitButton variant="quiet">{y.is_active ? "Take out of use" : "Put back in use"}</SubmitButton>
                  </ActionForm>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
        {canManage ? (
          <ActionForm action={addYard} className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-rule bg-paper p-4">
            <div className="min-w-48 flex-1">
              <Field label="Yard name">
                <Input name="name" required maxLength={40} defaultValue={`Yard ${String.fromCharCode(65 + Math.min(yards.data.length, 25))}`} />
              </Field>
            </div>
            <SubmitButton>Add yard</SubmitButton>
          </ActionForm>
        ) : null}
      </Section>

      <Section title="How play works">
        <ActionForm action={savePlayHours} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Sessions for each pet, per day" hint="0 turns play planning off.">
              <Input name="sessions" type="number" min={0} max={12} defaultValue={org.play_sessions_per_day} />
            </Field>
            <Field label="Minutes per session" hint="Peak periods can shorten this.">
              <Input name="minutes" type="number" min={5} max={240} defaultValue={org.play_session_minutes} />
            </Field>
            <Field label="Minutes between pets" hint="To walk one out and the next in.">
              <Input name="changeover" type="number" min={0} max={60} defaultValue={org.play_changeover_minutes} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Yards open">
              <Input name="dayStart" type="time" required defaultValue={hm(org.play_day_start)} />
            </Field>
            <Field label="Yards close">
              <Input name="dayEnd" type="time" required defaultValue={hm(org.play_day_end)} />
            </Field>
            <Field label="Break starts" hint="Optional, for the midday heat.">
              <Input name="breakStart" type="time" defaultValue={hm(org.play_break_start)} />
            </Field>
            <Field label="Break ends">
              <Input name="breakEnd" type="time" defaultValue={hm(org.play_break_end)} />
            </Field>
          </div>
          {canManage ? <SubmitButton>Save play settings</SubmitButton> : null}
        </ActionForm>
      </Section>

      <Calculator
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
function Calculator({ params, defaults, yardsYouHave }: { params: Record<string, string | string[] | undefined>; defaults: Inputs; yardsYouHave: number }) {
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
    if (need === null) answer = { tone: "error", text: "A session does not fit in those hours. Open the yards for longer or shorten the sessions." };
    else
      answer = {
        tone: need <= yardsYouHave ? "ok" : "info",
        text: `${v.dogs} pets need ${hours} yard-hours a day: ${need} ${need === 1 ? "yard" : "yards"} in use the whole time. You have ${yardsYouHave} in use.`,
      };
  } catch {
    answer = { tone: "error", text: "Check the numbers and times: the yards must close after they open, and any break must be inside those hours." };
  }

  return (
    <Section title="How many yards do I need?">
      <form method="get" className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        <Notice tone={answer.tone}>{answer.text}</Notice>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Pets">
            <Input name="dogs" type="number" min={0} max={2000} defaultValue={str("dogs")} />
          </Field>
          <Field label="Sessions each">
            <Input name="sessions" type="number" min={1} max={12} defaultValue={str("sessions")} />
          </Field>
          <Field label="Minutes">
            <Input name="minutes" type="number" min={5} max={240} defaultValue={str("minutes")} />
          </Field>
          <Field label="Between pets">
            <Input name="changeover" type="number" min={0} max={60} defaultValue={str("changeover")} />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Open">
            <Input name="dayStart" type="time" defaultValue={str("dayStart")} />
          </Field>
          <Field label="Close">
            <Input name="dayEnd" type="time" defaultValue={str("dayEnd")} />
          </Field>
          <Field label="Break from">
            <Input name="breakStart" type="time" defaultValue={str("breakStart")} />
          </Field>
          <Field label="Break to">
            <Input name="breakEnd" type="time" defaultValue={str("breakEnd")} />
          </Field>
        </div>
        <button type="submit" className={buttonStyles.secondary}>
          Work it out
        </button>
      </form>
    </Section>
  );
}
