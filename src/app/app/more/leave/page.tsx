import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { diffDays, formatDate, todayIn } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n, type I18n } from "@/lib/i18n-server";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { workers } from "@/lib/team";
import { answerLeave, askLeave, withdrawLeave } from "./actions";

export const generateMetadata = () => appTitle((m) => m.leave.title);

/** Leave (M43): ask for days off; owners and managers answer. */
export default function LeavePage({ searchParams }: PageProps<"/app/more/leave">) {
  return (
    <Suspense fallback={<Loading />}>
      <Leave searchParams={searchParams} />
    </Suspense>
  );
}

type LeaveRow = Pick<Tables<"leave_requests">, "id" | "user_id" | "starts_on" | "ends_on" | "reason" | "status" | "answer">;

const TONE = { asked: "attention", granted: "good", refused: "alert", withdrawn: "neutral" } as const;

async function Leave({ searchParams }: Pick<PageProps<"/app/more/leave">, "searchParams">) {
  const done = (await searchParams).done;
  const { org, user, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const w = m.leave;
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
  const supabase = await createClient();
  const columns = "id, user_id, starts_on, ends_on, reason, status, answer";
  const [mine, waiting, coming, names, people] = await Promise.all([
    supabase.from("leave_requests").select(columns).eq("org_id", org.id).eq("user_id", user.id).order("starts_on", { ascending: false }).limit(30),
    canManage
      ? supabase.from("leave_requests").select(columns).eq("org_id", org.id).eq("status", "asked").order("starts_on").limit(100)
      : Promise.resolve({ data: [] as LeaveRow[], error: null }),
    canManage
      ? supabase.from("leave_requests").select(columns).eq("org_id", org.id).eq("status", "granted").gte("ends_on", today).order("starts_on").limit(100)
      : Promise.resolve({ data: [] as LeaveRow[], error: null }),
    supabase.from("memberships").select("user_id, display_name").eq("org_id", org.id),
    canManage ? workers(supabase, org.id) : Promise.resolve([]),
  ]);
  if (mine.error || waiting.error || coming.error) throw new Error("Could not load leave.");
  const nameOf = new Map((names.data ?? []).map((n) => [n.user_id, n.display_name]));

  return (
    <>
      {title}
      <p className="mb-5 text-slate">{w.about}</p>
      {done === "granted" || done === "refused" || done === "withdrawn" ? <Notice tone="ok">{w[done]}</Notice> : null}

      {canManage ? (
        <Section title={w.waiting} count={waiting.data.length}>
          {waiting.data.length === 0 ? (
            <Empty>{w.noneWaiting}</Empty>
          ) : (
            <ul className="space-y-3">
              {waiting.data.map((l) => (
                <li key={l.id} className="rounded-xl border border-rule bg-paper p-4">
                  <LeaveLine t={t} leave={l} name={nameOf.get(l.user_id)} />
                  {l.user_id === user.id ? null : (
                    <ActionForm action={answerLeave} className="mt-3 space-y-3">
                      <input type="hidden" name="leaveId" value={l.id} />
                      <Field label={w.answer} hint={w.answerHint}>
                        <Input name="answer" maxLength={300} />
                      </Field>
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton name="decision" value="granted" pendingLabel={m.common.saving}>
                          {w.grant}
                        </SubmitButton>
                        <SubmitButton name="decision" value="refused" variant="secondary" pendingLabel={m.common.saving}>
                          {w.refuse}
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Section>
      ) : null}

      {canManage ? (
        <Section title={w.coming} count={coming.data.length}>
          {coming.data.length === 0 ? (
            <Empty>{w.noneComing}</Empty>
          ) : (
            <Ledger>
              {coming.data.map((l) => (
                <LedgerRow key={l.id}>
                  <LeaveLine t={t} leave={l} name={nameOf.get(l.user_id)} />
                  <ActionForm action={withdrawLeave} className="contents">
                    <input type="hidden" name="leaveId" value={l.id} />
                    <SubmitButton variant="quiet" pendingLabel={m.common.saving}>
                      {w.withdraw}
                    </SubmitButton>
                  </ActionForm>
                </LedgerRow>
              ))}
            </Ledger>
          )}
        </Section>
      ) : null}

      <Section title={w.ask.title}>
        <ActionForm action={askLeave} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
          {canManage ? (
            <Field label={w.ask.who}>
              <Select name="userId" defaultValue={user.id}>
                {people.map((p) => (
                  <option key={p.user_id} value={p.user_id}>
                    {p.display_name}
                  </option>
                ))}
              </Select>
            </Field>
          ) : null}
          <Field label={w.ask.from}>
            <Input name="from" type="date" required min={today} />
          </Field>
          <Field label={w.ask.to}>
            <Input name="to" type="date" required min={today} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={w.ask.reason} hint={w.ask.reasonHint}>
              <Textarea name="reason" maxLength={300} rows={2} />
            </Field>
          </div>
          {canManage ? (
            <label className="flex min-h-12 items-start gap-3 sm:col-span-2">
              <input type="checkbox" name="granted" className="mt-1 size-5" />
              <span>{w.ask.granted}</span>
            </label>
          ) : null}
          <SubmitButton pendingLabel={m.common.saving}>{w.ask.button}</SubmitButton>
        </ActionForm>
      </Section>

      <Section title={w.yours} count={mine.data.length}>
        {mine.data.length === 0 ? (
          <Empty>{w.noneYours}</Empty>
        ) : (
          <Ledger>
            {mine.data.map((l) => (
              <LedgerRow key={l.id}>
                <LeaveLine t={t} leave={l} />
                {(l.status === "asked" || l.status === "granted") && l.ends_on >= today ? (
                  <ActionForm action={withdrawLeave} className="contents">
                    <input type="hidden" name="leaveId" value={l.id} />
                    <SubmitButton variant="quiet" pendingLabel={m.common.saving}>
                      {w.withdraw}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>
    </>
  );
}

/** One request: whose (when it is not the reader's own list), the days, its state, the reason and any answer. */
function LeaveLine({ t, leave, name }: { t: I18n; leave: LeaveRow; name?: string }) {
  const w = t.m.leave;
  return (
    <span className="min-w-0 flex-1">
      <span className="flex flex-wrap items-center gap-2">
        {name ? <span className="font-bold">{name}</span> : null}
        <span className={name ? "" : "font-bold"}>{fill(w.dates, { from: formatDate(leave.starts_on, t.locale), to: formatDate(leave.ends_on, t.locale) })}</span>
        <span className="text-slate">{plural(t.language, diffDays(leave.starts_on, leave.ends_on) + 1, w.days)}</span>
        <Badge tone={TONE[leave.status]}>{w.status[leave.status]}</Badge>
      </span>
      {leave.reason ? <span className="block text-slate">{leave.reason}</span> : null}
      {leave.answer ? <span className="block text-sm">{fill(w.answerLine, { answer: leave.answer })}</span> : null}
    </span>
  );
}
