import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Empty, Field, Input, Loading, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { flagText } from "@/lib/bookings";
import { formatDate, todayIn, toClock, toMinutes } from "@/lib/core";
import { createClient } from "@/lib/supabase/server";
import { clearPlan, moveSession, planToday, sessionDone, sessionSkip, sessionUndo } from "./actions";

export const metadata: Metadata = { title: "Play" };

export default function PlayPage() {
  return (
    <>
      <PageTitle title="Play">
        <Link href="/app/care" className={buttonStyles.secondary}>
          Care
        </Link>
      </PageTitle>
      <Suspense fallback={<Loading label="Loading the play timetable" />}>
        <Play />
      </Suspense>
    </>
  );
}

async function Play() {
  const { org, canManage } = await requireOrg();
  const today = todayIn(org.time_zone);
  const supabase = await createClient();

  const [yards, sessions, inHouse] = await Promise.all([
    supabase.from("play_yards").select("id, name").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    supabase
      .from("play_sessions")
      .select("id, yard_id, pet_id, starts_at, duration_minutes, status, note, bookings(kennels(name), pets(name, flags))")
      .eq("org_id", org.id)
      .eq("session_date", today)
      .order("starts_at"),
    supabase.from("bookings").select("pet_id", { count: "exact" }).eq("org_id", org.id).eq("status", "checked_in").lte("start_date", today),
  ]);
  if (yards.error || sessions.error || inHouse.error) throw new Error("Could not load the play timetable.");

  if (org.play_sessions_per_day === 0) {
    return (
      <Empty>
        Play planning is off.{" "}
        <Link href="/app/more/play" className="font-semibold text-ink underline underline-offset-4">
          Set it up on Play yards
        </Link>
      </Empty>
    );
  }

  const live = sessions.data.filter((s) => s.status !== "skipped");
  const perPet = new Map<string, number>();
  for (const s of live) perPet.set(s.pet_id, (perPet.get(s.pet_id) ?? 0) + 1);
  const short = (inHouse.data ?? []).filter((b) => (perPet.get(b.pet_id) ?? 0) < org.play_sessions_per_day).length;
  const done = sessions.data.filter((s) => s.status === "done").length;

  return (
    <>
      <p className="mb-4 text-lg">
        {formatDate(today)}. <strong className="font-extrabold">{done}</strong> of <strong className="font-extrabold">{live.length}</strong> sessions done.
        {short > 0 ? ` ${short} ${short === 1 ? "pet is" : "pets are"} not fully planned.` : ""}
      </p>
      <div className="mb-6 flex flex-wrap gap-2">
        <ActionForm action={planToday} className="w-full space-y-2">
          <SubmitButton pendingLabel="Planning">{live.length === 0 ? "Plan today" : "Plan the rest"}</SubmitButton>
        </ActionForm>
        {canManage && sessions.data.some((s) => s.status === "pending") ? (
          <ActionForm action={clearPlan} className="contents">
            <SubmitButton variant="quiet" pendingLabel="Clearing">
              Clear the plan
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>

      {yards.data.length === 0 ? (
        <Empty>
          No play yards yet.{" "}
          <Link href="/app/more/play" className="font-semibold text-ink underline underline-offset-4">
            Add a yard
          </Link>
        </Empty>
      ) : (
        yards.data.map((y) => {
          const list = sessions.data.filter((s) => s.yard_id === y.id);
          return (
            <Section key={y.id} title={y.name} count={list.filter((s) => s.status === "pending").length}>
              {list.length === 0 ? (
                <Empty>Nothing planned in this yard.</Empty>
              ) : (
                <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
                  {list.map((s) => {
                    const start = s.starts_at.slice(0, 5);
                    const end = toClock(Math.min(toMinutes(start) + s.duration_minutes, 24 * 60 - 1));
                    const pet = s.bookings?.pets;
                    return (
                      <li key={s.id} className={`px-4 py-3 ${s.status === "skipped" ? "text-slate" : ""}`}>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                          <div className="min-w-0 flex-1 basis-56">
                            <p className="flex flex-wrap items-center gap-2">
                              <span className="font-extrabold">
                                {start} to {end}
                              </span>
                              <DoorTag name={s.bookings?.kennels?.name} />
                              <span className="text-lg font-bold">{pet?.name ?? "Pet"}</span>
                              {s.status === "done" ? <Badge tone="good">Done</Badge> : null}
                              {s.status === "skipped" ? <Badge tone="attention">Skipped</Badge> : null}
                              {(pet?.flags ?? []).map((f) => (
                                <Badge key={f} tone="alert">
                                  {flagText(f)}
                                </Badge>
                              ))}
                            </p>
                            {s.note ? <p className="mt-1">Note: {s.note}</p> : null}
                          </div>
                          {s.status === "pending" ? (
                            <ActionForm action={sessionDone} className="contents">
                              <input type="hidden" name="sessionId" value={s.id} />
                              <SubmitButton pendingLabel="Saving" className="min-w-28">
                                Done
                              </SubmitButton>
                            </ActionForm>
                          ) : (
                            <ActionForm action={sessionUndo} className="contents">
                              <input type="hidden" name="sessionId" value={s.id} />
                              <SubmitButton variant="quiet" pendingLabel="Undoing">
                                Undo
                              </SubmitButton>
                            </ActionForm>
                          )}
                        </div>
                        {s.status === "pending" ? (
                          <details className="mt-2">
                            <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold text-slate underline underline-offset-4">Move or skip</summary>
                            <ActionForm action={moveSession} className="mt-2 flex flex-wrap items-end gap-3">
                              <input type="hidden" name="sessionId" value={s.id} />
                              <div className="w-32">
                                <Field label="Time">
                                  <Input name="startsAt" type="time" required defaultValue={start} />
                                </Field>
                              </div>
                              <div className="min-w-36 flex-1">
                                <Field label="Yard">
                                  <Select name="yardId" defaultValue={y.id}>
                                    {yards.data.map((o) => (
                                      <option key={o.id} value={o.id}>
                                        {o.name}
                                      </option>
                                    ))}
                                  </Select>
                                </Field>
                              </div>
                              <SubmitButton variant="secondary" pendingLabel="Moving">
                                Move
                              </SubmitButton>
                            </ActionForm>
                            <ActionForm action={sessionSkip} className="mt-3 flex flex-wrap items-end gap-3">
                              <input type="hidden" name="sessionId" value={s.id} />
                              <div className="min-w-48 flex-1">
                                <Field label="Why skip? (optional)">
                                  <Input name="note" maxLength={500} />
                                </Field>
                              </div>
                              <SubmitButton variant="quiet" pendingLabel="Skipping">
                                Skip session
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
