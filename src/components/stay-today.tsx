import Link from "next/link";
import type { ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { Icon } from "@/components/icons";
import { TickButton } from "@/components/tick-button";
import { Badge, buttonStyles, Ledger, Section, Textarea } from "@/components/ui";
import { markDone, skipTask, undoTask } from "@/app/app/care/actions";
import { updateIncident } from "@/app/app/dogs/actions";
import { clockText } from "@/lib/care";
import { formatDate, formatPhone, localClock, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import type { I18n } from "@/lib/i18n-server";
import type { Enums } from "@/lib/supabase/database.types";

/**
 * The cards of a stay's Today tab (D61): an open incident, today's care with
 * Done and Skip, the last update, and beside them the bill so far, the health
 * papers and the parent. Each is given what the booking page has already read.
 */

type Incident = { id: string; occurred_at: string; severity: Enums<"incident_severity">; description: string; action_taken: string | null; parent_notified_at: string | null };

/** Incidents of this pet that are still open, each with Tell the parent and Mark resolved. */
export function StayIncidents({ t, incidents, phone, timeZone }: { t: I18n; incidents: Incident[]; phone: string | null; timeZone: string }) {
  const { m, locale } = t;
  const w = m.booking.incidentCard;
  if (incidents.length === 0) return null;
  const when = (at: string) => new Intl.DateTimeFormat(locale, { timeZone, day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(at));
  return (
    <>
      {incidents.map((i) => (
        <section key={i.id} className="mb-(--wb-gap) flex flex-wrap items-center gap-x-5 gap-y-3 rounded-2xl border-2 border-alert bg-alert-soft px-(--wb-pad) py-4">
          <div className="min-w-0 flex-[1_1_280px]">
            <h2 className="flex flex-wrap items-center gap-2 text-[17px] font-bold text-alert-ink">
              {fill(w.title, { when: when(i.occurred_at) })}
              <span className="inline-flex min-h-6 items-center rounded-full bg-paper px-[9px] text-[12.5px] font-[650]">{m.labels.severityShort[i.severity]}</span>
            </h2>
            {i.parent_notified_at ? null : (
              <p className="mt-1.5">
                <Badge tone="attention">{m.today.parentNotTold}</Badge>
              </p>
            )}
            <p className="mt-1.5">
              {i.description}
              {i.action_taken ? ` ${i.action_taken}` : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {!i.parent_notified_at && phone ? (
              <a href={whatsappLink("", phone)} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
                {m.today.tellParent}
              </a>
            ) : null}
            <ActionForm action={updateIncident} className="contents">
              <input type="hidden" name="incidentId" value={i.id} />
              <input type="hidden" name="what" value="resolved" />
              <SubmitButton variant="secondary" pendingLabel={w.saving}>
                {w.resolve}
              </SubmitButton>
            </ActionForm>
          </div>
        </section>
      ))}
    </>
  );
}

type Task = { id: string; kind: Enums<"care_kind">; label: string; details: string | null; due_time: string | null; status: Enums<"task_status">; note: string | null; done_at: string | null; done_by: string | null; needs_photo: boolean };

/** Today's care for this pet, in the order of the day: what was done and by whom, and Done and Skip on what is left. */
export function StayCareToday({
  t,
  tasks,
  names,
  timeZone,
  skipId,
  href,
}: {
  t: I18n;
  tasks: Task[];
  /** Who each task was done by, by user id. */
  names: Map<string, string>;
  timeZone: string;
  /** The task whose Skip was tapped: its row opens to ask why. */
  skipId: string | null;
  /** This page's address, to which `skip=` is added. */
  href: string;
}) {
  const { m } = t;
  const w = m.booking.careToday;
  const owed = tasks.filter((x) => x.status !== "skipped");
  const doneCount = owed.filter((x) => x.status === "done").length;
  return (
    <Section
      title={w.title}
      meta={tasks.length > 0 ? fill(m.today.careDone, { done: doneCount, total: owed.length }) : undefined}
      action={
        <Link href={`${href}?tab=health#routines`} className={buttonStyles.quiet}>
          {w.changeRoutine}
        </Link>
      }
    >
      {tasks.length === 0 ? (
        <p className="text-slate">{w.none}</p>
      ) : (
        <Ledger>
          {tasks.map((x) => {
            const medicine = x.kind === "medication";
            const pending = x.status === "pending";
            const who = x.done_by ? names.get(x.done_by) : null;
            return (
              <li key={x.id} className={`px-(--wb-pad) py-2.5 ${medicine ? "bg-[#fdf6f5]" : ""}`}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <span className="w-12 shrink-0 text-[15px] font-bold tabular-nums">{clockText(m, x.due_time)}</span>
                  <span
                    role="img"
                    aria-label={x.status === "done" ? w.statusDone : x.status === "skipped" ? w.skipped : w.statusToDo}
                    className={`inline-flex size-7 shrink-0 items-center justify-center rounded-full ${
                      x.status === "done" ? "bg-leaf text-paper" : `border-2 bg-paper ${medicine ? "border-alert" : "border-rule-strong"}`
                    }`}
                  >
                    {x.status === "done" ? <Icon name="check" className="size-4" /> : null}
                  </span>
                  <div className="min-w-0 flex-[1_1_200px]">
                    <p className={`font-bold ${medicine ? "text-alert-ink" : ""}`}>{medicine ? fill(w.medicine, { label: x.label }) : x.label}</p>
                    {x.details ? <p className="text-sm text-slate">{x.details}</p> : null}
                  </div>
                  {pending ? (
                    <div className="flex items-center gap-1">
                      {skipId === x.id ? null : (
                        <Link href={`${href}?skip=${x.id}`} scroll={false} className={buttonStyles.quiet} aria-label={fill(m.care.skipTask, { task: x.label.toLowerCase() })}>
                          {m.care.skip}
                        </Link>
                      )}
                      {x.needs_photo ? (
                        // A task that asks for a photo is done on the care round, with the photo.
                        <Link href="/app/care" className={`${buttonStyles.primary} min-w-[92px]`}>
                          {m.care.markDone}
                        </Link>
                      ) : (
                        <TickButton taskId={x.id} action={markDone} words={m.offline} label={m.care.markDone} pendingLabel={m.common.saving} ariaLabel={fill(m.care.doneLabel, { task: x.label, pet: "" }).trim()} />
                      )}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-slate">
                        {x.status === "skipped"
                          ? [w.skipped, x.note].filter(Boolean).join(": ")
                          : [who && x.done_at ? fill(w.by, { who, time: localClock(x.done_at, timeZone) }) : x.done_at ? localClock(x.done_at, timeZone) : null, x.note].filter(Boolean).join(", ")}
                      </span>
                      <ActionForm action={undoTask} className="contents">
                        <input type="hidden" name="taskId" value={x.id} />
                        <SubmitButton variant="quiet" pendingLabel={m.care.undoing} className="min-h-10! text-steel!">
                          {m.care.undo}
                        </SubmitButton>
                      </ActionForm>
                    </div>
                  )}
                </div>
                {pending && skipId === x.id ? (
                  <ActionForm action={skipTask} className="mt-3 space-y-2">
                    <input type="hidden" name="taskId" value={x.id} />
                    <input type="hidden" name="kind" value={x.kind} />
                    <label className="block">
                      <span className="mb-1 block font-semibold">{medicine ? m.care.whyNotGiven : m.care.whyOptional}</span>
                      <Textarea name="note" rows={2} maxLength={500} required={medicine} autoFocus />
                    </label>
                    <div className="flex flex-wrap gap-2">
                      <SubmitButton variant="secondary" pendingLabel={m.care.skipping}>
                        {fill(m.care.skipTask, { task: x.label.toLowerCase() })}
                      </SubmitButton>
                      <Link href={href} scroll={false} className={buttonStyles.quiet}>
                        {m.common.cancel}
                      </Link>
                    </div>
                  </ActionForm>
                ) : null}
              </li>
            );
          })}
        </Ledger>
      )}
    </Section>
  );
}

/** A line of a card with its figure at the right. */
function Line({ label, children, className = "" }: { label: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={`flex justify-between gap-3 ${className}`}>
      <span className="min-w-0">{label}</span>
      <span className="shrink-0 tabular-nums">{children}</span>
    </div>
  );
}

/** What the stay comes to now: its lines, tax, total, what was paid ahead, and what is still to pay. */
export function BillSoFar({
  t,
  lines,
  taxMinor,
  totalMinor,
  paidMinor,
  dueMinor,
  status,
  money,
  children,
}: {
  t: I18n;
  lines: { label: string; totalMinor: number }[];
  taxMinor: number;
  totalMinor: number;
  /** Paid ahead, or paid on the bill. */
  paidMinor: number;
  dueMinor: number;
  /** A badge beside the heading: "Not issued", the bill's number, "Paid". */
  status: ReactNode;
  money: (minor: number) => string;
  /** The buttons under the card. */
  children: ReactNode;
}) {
  const w = t.m.booking.billSoFar;
  return (
    <Section title={w.title} meta={status}>
      <div className="flex flex-col gap-2.5 text-[15px]">
        {lines.map((l, i) => (
          <Line key={i} label={l.label}>
            {money(l.totalMinor)}
          </Line>
        ))}
        <div className="mt-1 flex flex-col gap-2.5 border-t border-rule pt-3">
          {taxMinor > 0 ? (
            <Line label={w.tax} className="text-slate">
              {money(taxMinor)}
            </Line>
          ) : null}
          <Line label={w.total} className="font-bold">
            {money(totalMinor)}
          </Line>
          {paidMinor > 0 ? (
            <Line label={w.paidAhead} className="text-leaf-ink">
              {money(paidMinor)}
            </Line>
          ) : null}
        </div>
        <div className={`mt-1 flex items-center justify-between gap-3 rounded-xl px-4 py-3.5 ${dueMinor > 0 ? "bg-marigold-soft text-[#3d2a00]" : "bg-leaf-soft text-leaf-ink"}`}>
          <span className="font-bold">{w.stillToPay}</span>
          <strong className="text-2xl font-extrabold tracking-[-0.01em] tabular-nums">{money(Math.max(dueMinor, 0))}</strong>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 [&>*]:flex-1">{children}</div>
      </div>
    </Section>
  );
}

/** The pet's vaccinations, each with the day it runs out, and its allergies. */
export function HealthCard({
  t,
  vaccinations,
  allergies,
  stayEnds,
  href,
}: {
  t: I18n;
  vaccinations: { id: string; vaccine: string; valid_until: string | null }[];
  allergies: string | null;
  stayEnds: string;
  href: string;
}) {
  const { m, locale } = t;
  const w = m.booking.healthCard;
  // In order: every vaccination on record lasts the stay.
  const inOrder = vaccinations.length > 0 && vaccinations.every((v) => v.valid_until !== null && v.valid_until >= stayEnds);
  return (
    <Section
      title={w.title}
      meta={
        <Link href={href}>
          <Badge tone={inOrder ? "good" : "attention"}>{inOrder ? w.inOrder : w.check}</Badge>
        </Link>
      }
    >
      {vaccinations.length === 0 && !allergies ? <p className="text-slate">{w.none}</p> : null}
      <Ledger>
        {vaccinations.map((v) => {
          const lapsed = v.valid_until === null || v.valid_until < stayEnds;
          return (
            <li key={v.id} className="flex items-center justify-between gap-3 px-(--wb-pad) py-3">
              <span className="capitalize">{v.vaccine.replaceAll("_", " ")}</span>
              <span className={`text-sm ${lapsed ? "font-bold text-alert-ink" : "text-slate"}`}>{v.valid_until ? fill(w.until, { date: formatDate(v.valid_until, locale) }) : w.noDate}</span>
            </li>
          );
        })}
        {allergies ? (
          <li className="flex items-center justify-between gap-3 px-(--wb-pad) py-3">
            <span>{m.booking.about.allergies}</span>
            <strong className="text-right text-alert-ink">{allergies}</strong>
          </li>
        ) : null}
      </Ledger>
    </Section>
  );
}

/** Who to call: the parent, with WhatsApp and the link to their stay page. */
export function ParentCard({
  t,
  parent,
  notes,
  stayUrl,
}: {
  t: I18n;
  parent: { id: string; full_name: string; phone: string };
  /** The booking's notes for staff, shown under the phone number. */
  notes: string | null;
  /** Null when the stay has no page for the parent (cancelled, or the pet did not come). */
  stayUrl: string | null;
}) {
  const { m } = t;
  const w = m.booking.parentCard;
  return (
    <Section title={w.title}>
      <p>
        <Link href={`/app/clients/${parent.id}`} className="font-bold underline-offset-4 hover:underline">
          {parent.full_name}
        </Link>
      </p>
      <p className="text-sm text-slate">
        <a href={`tel:${parent.phone}`} className="underline-offset-4 hover:underline">
          {formatPhone(parent.phone)}
        </a>
      </p>
      {notes ? <p className="mt-3 whitespace-pre-line rounded-xl bg-wash px-3.5 py-3 text-sm">{fill(w.notes, { notes })}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <a href={whatsappLink("", parent.phone)} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
          {w.whatsapp}
        </a>
        {stayUrl ? <CopyButton text={stayUrl} words={m.copy} label={w.copy} /> : null}
      </div>
    </Section>
  );
}
