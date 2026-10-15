import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Empty, Field, Input, Loading, PageTitle, Section, Select } from "@/components/ui";
import { Rich } from "@/components/rich";
import { requireOrg } from "@/lib/auth";
import { flagText } from "@/lib/bookings";
import { formatDate, todayIn, toClock, toMinutes } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { PetAvatar } from "@/components/pet-avatar";
import { clearPlan, moveSession, planToday, sessionDone, sessionSkip, sessionUndo } from "./actions";

export const generateMetadata = () => appTitle((m) => m.play.title);

export default function PlayPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Play />
    </Suspense>
  );
}

async function Play() {
  const { org, canManage } = await requireOrg();
  const { m, language, locale } = await getAppI18n();
  const title = (
    <PageTitle title={m.play.title}>
      <Link href="/app/care" className={buttonStyles.secondary}>
        {m.care.title}
      </Link>
    </PageTitle>
  );
  const today = todayIn(org.time_zone);
  const supabase = await createClient();

  const [yards, sessions, inHouse] = await Promise.all([
    supabase.from("play_yards").select("id, name").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    supabase
      .from("play_sessions")
      .select("id, yard_id, pet_id, starts_at, duration_minutes, status, note, bookings(kennels(name), pets(name, flags, photo_path))")
      .eq("org_id", org.id)
      .eq("session_date", today)
      .order("starts_at"),
    supabase.from("bookings").select("pet_id", { count: "exact" }).eq("org_id", org.id).eq("status", "checked_in").lte("start_date", today),
  ]);
  if (yards.error || sessions.error || inHouse.error) throw new Error("Could not load the play timetable.");

  if (org.play_sessions_per_day === 0) {
    return (
      <>
        {title}
        <Empty>
          {m.play.off}{" "}
          <Link href="/app/more/play" className="font-semibold text-ink underline underline-offset-4">
            {m.play.setUp}
          </Link>
        </Empty>
      </>
    );
  }

  const live = sessions.data.filter((s) => s.status !== "skipped");
  const photos = await signedUrls(supabase, sessions.data.map((s) => s.bookings?.pets?.photo_path), { small: true });
  const perPet = new Map<string, number>();
  for (const s of live) perPet.set(s.pet_id, (perPet.get(s.pet_id) ?? 0) + 1);
  const short = (inHouse.data ?? []).filter((b) => (perPet.get(b.pet_id) ?? 0) < org.play_sessions_per_day).length;
  const done = sessions.data.filter((s) => s.status === "done").length;

  // {done} and {total} are left in place by plural() so that Rich can draw them in bold.
  const summary = plural(language, live.length, m.play.sessionsDone, { date: formatDate(today, locale), done: "{done}", total: "{total}" });

  return (
    <>
      {title}
      <p className="mb-4 text-lg">
        <Rich
          text={summary}
          parts={{ done: <strong className="font-extrabold">{done}</strong>, total: <strong className="font-extrabold">{live.length}</strong> }}
        />
        {short > 0 ? ` ${plural(language, short, m.play.notFullyPlanned)}` : ""}
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        <ActionForm action={planToday} className="w-full space-y-2">
          <SubmitButton pendingLabel={m.play.planning}>{live.length === 0 ? m.play.planToday : m.play.planRest}</SubmitButton>
        </ActionForm>
        {canManage && sessions.data.some((s) => s.status === "pending") ? (
          <ActionForm action={clearPlan} className="contents">
            <SubmitButton variant="quiet" pendingLabel={m.play.clearing}>
              {m.play.clear}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>

      {yards.data.length === 0 ? (
        <Empty>
          {m.play.noYards}{" "}
          <Link href="/app/more/play" className="font-semibold text-ink underline underline-offset-4">
            {m.play.addYard}
          </Link>
        </Empty>
      ) : (
        yards.data.map((y) => {
          const list = sessions.data.filter((s) => s.yard_id === y.id);
          return (
            <Section key={y.id} title={y.name} count={list.filter((s) => s.status === "pending").length}>
              {list.length === 0 ? (
                <Empty>{m.play.nothingInYard}</Empty>
              ) : (
                <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
                  {list.map((s) => {
                    const start = s.starts_at.slice(0, 5);
                    const end = toClock(Math.min(toMinutes(start) + s.duration_minutes, 24 * 60 - 1));
                    const pet = s.bookings?.pets;
                    return (
                      <li key={s.id} className={`px-4 py-3 ${s.status === "skipped" ? "text-slate" : ""}`}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <PetAvatar name={pet?.name ?? "?"} url={pet?.photo_path ? photos.get(pet.photo_path) : null} />
                          <div className="min-w-0 flex-1 basis-48">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-extrabold">{fill(m.play.times, { start, end })}</span>
                              <DoorTag name={s.bookings?.kennels?.name} empty={m.common.noKennel} />
                              <span className="text-lg font-bold">{pet?.name ?? m.care.pet}</span>
                              {s.status === "done" ? <Badge tone="good">{m.labels.taskStatus.done}</Badge> : null}
                              {s.status === "skipped" ? <Badge tone="attention">{m.labels.taskStatus.skipped}</Badge> : null}
                              {(pet?.flags ?? []).map((f) => (
                                <Badge key={f} tone="alert">
                                  {flagText(m, f)}
                                </Badge>
                              ))}
                            </p>
                            {s.note ? <p className="mt-1">{fill(m.care.note, { note: s.note })}</p> : null}
                          </div>
                          {s.status === "pending" ? (
                            <ActionForm action={sessionDone} className="contents">
                              <input type="hidden" name="sessionId" value={s.id} />
                              <SubmitButton pendingLabel={m.common.saving} className="min-w-28">
                                {m.care.markDone}
                              </SubmitButton>
                            </ActionForm>
                          ) : (
                            <ActionForm action={sessionUndo} className="contents">
                              <input type="hidden" name="sessionId" value={s.id} />
                              <SubmitButton variant="quiet" pendingLabel={m.care.undoing}>
                                {m.care.undo}
                              </SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                        {s.status === "pending" ? (
                          <details className="mt-2">
                            <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold text-slate underline underline-offset-4">{m.play.moveOrSkip}</summary>
                            <ActionForm action={moveSession} className="mt-2 flex flex-wrap items-end gap-3">
                              <input type="hidden" name="sessionId" value={s.id} />
                              <div className="w-32">
                                <Field label={m.play.time}>
                                  <Input name="startsAt" type="time" required defaultValue={start} />
                                </Field>
                              </div>
                              <div className="min-w-36 flex-1">
                                <Field label={m.play.yard}>
                                  <Select name="yardId" defaultValue={y.id}>
                                    {yards.data.map((o) => (
                                      <option key={o.id} value={o.id}>
                                        {o.name}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                              </div>
                              <SubmitButton variant="secondary" pendingLabel={m.play.moving}>
                                {m.play.move}
                              </SubmitButton>
                            </ActionForm>
                            <ActionForm action={sessionSkip} className="mt-3 flex flex-wrap items-end gap-3">
                              <input type="hidden" name="sessionId" value={s.id} />
                              <div className="min-w-48 flex-1">
                                <Field label={m.play.whySkip}>
                                  <Input name="note" maxLength={500} />
                                </Field>
                              </div>
                              <SubmitButton variant="quiet" pendingLabel={m.care.skipping}>
                                {m.play.skipSession}
                              </SubmitButton>
                            </ActionForm>
                          </details>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Section>
          );
        })
      )}
    </>
  );
}
