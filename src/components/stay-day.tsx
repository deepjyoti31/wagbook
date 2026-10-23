import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Section, Select, Textarea } from "@/components/ui";
import { checkIn } from "@/app/app/actions";
import { addSupply, costToExpense, markPassedAway, recordVetVisit, saveStayReport, saveTrialOutcome, setTrial, undoPassedAway } from "@/app/app/day-actions";
import { requireOrg } from "@/lib/auth";
import { addDays, formatDate, formatMoney, stayReport, supplyAmount, todayIn, whatsappLink } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { parentI18n, type I18n } from "@/lib/i18n-server";
import { signedUrls } from "@/lib/media";
import { ReportFigures } from "@/components/report-figures";
import type { Enums } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

/**
 * The booking page's part of Phase 6 (M50 to M57, D52): the question when the
 * kennel chosen at check-in is still to clean, what the parent brought, a
 * trial day and how it went, the stay report, and vet visits.
 */

/** Asked when the kennel chosen at check-in was not cleaned since its last pet (M50). */
export async function CleanQuestion({ t, bookingId, kennelId }: { t: I18n; bookingId: string; kennelId: string }) {
  const { org } = await requireOrg();
  const supabase = await createClient();
  const kennel = await supabase.from("kennels").select("name").eq("org_id", org.id).eq("id", kennelId).maybeSingle();
  if (!kennel.data) return null;
  const w = t.m.cleaning;
  return (
    <div className="mb-4 space-y-3 rounded-xl border-2 border-marigold bg-marigold-soft p-4">
      <p className="font-bold">{fill(w.ask, { kennel: kennel.data.name })}</p>
      <p className="text-sm">{w.askHint}</p>
      <ActionForm action={checkIn} className="contents">
        <input type="hidden" name="bookingId" value={bookingId} />
        <input type="hidden" name="kennelId" value={kennelId} />
        <input type="hidden" name="anyway" value="1" />
        <input type="hidden" name="from" value="booking" />
        <SubmitButton pendingLabel={t.m.booking.step.checkingIn}>{w.anyway}</SubmitButton>
      </ActionForm>
    </div>
  );
}

/** Food and medicines the parent brought (M55): counted down, with a form while the pet is coming or in. */
export async function StaySupplies({ t, bookingId, petId, status }: { t: I18n; bookingId: string; petId: string; status: Enums<"booking_status"> }) {
  const { org } = await requireOrg();
  const w = t.m.supplies;
  const supabase = await createClient();
  const [left, routines] = await Promise.all([
    supabase.from("stay_supply_left").select("supply_id, kind, label, brought, left_amount, days_left, runs_short, tasks_a_day").eq("org_id", org.id).eq("booking_id", bookingId),
    supabase.from("care_items").select("id, label, due_time").eq("org_id", org.id).eq("pet_id", petId).eq("kind", "medication").eq("is_active", true).order("due_time"),
  ]);
  if (left.error || routines.error) return null;
  const open = status === "confirmed" || status === "checked_in";
  if (!open && left.data.length === 0) return null;
  const amount = (kind: string | null, n: number | null) => supplyAmount(kind === "medicine" ? "medicine" : "food", n ?? 0, w, t.locale);

  return (
    <Section title={w.title} count={left.data.length}>
      <p className="mb-3 text-sm text-slate">{w.about}</p>
      {left.data.length === 0 ? (
        <Empty>{w.none}</Empty>
      ) : (
        <Ledger>
          {left.data.map((s) => (
            <LedgerRow key={s.supply_id}>
              <span className="min-w-0 flex-1">
                <span className="font-bold">{s.label}</span> <Badge>{w.kinds[s.kind === "medicine" ? "medicine" : "food"]}</Badge>
                <span className="block">{fill(w.left, { left: amount(s.kind, s.left_amount), brought: amount(s.kind, s.brought) })}</span>
                {status === "checked_in" ? (
                  <span className="block text-sm text-slate">
                    {s.tasks_a_day === 0 || s.days_left === null
                      ? w.noRoutine
                      : s.days_left === 0
                        ? w.runsOutToday
                        : plural(t.language, s.days_left, w.daysLeft)}
                  </span>
                ) : null}
                {s.runs_short ? (
                  <span className="mt-1 block">
                    <Badge tone="alert">{w.short}</Badge>
                  </span>
                ) : null}
              </span>
            </LedgerRow>
          ))}
        </Ledger>
      )}
      {open ? (
        <details className="mt-3 rounded-xl border border-rule bg-paper p-4">
          <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold">{w.add}</summary>
          <ActionForm action={addSupply} className="mt-2 space-y-4">
            <input type="hidden" name="bookingId" value={bookingId} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={w.kind}>
                <Select name="kind" defaultValue="food">
                  <option value="food">{w.kinds.food}</option>
                  <option value="medicine">{w.kinds.medicine}</option>
                </Select>
              </Field>
              <Field label={w.label} hint={w.labelHint}>
                <Input name="label" required maxLength={80} />
              </Field>
              <Field label={w.brought} hint={w.broughtHint}>
                <Input name="brought" inputMode="numeric" required pattern="[0-9]*" autoComplete="off" />
              </Field>
              <Field label={w.perTask} hint={w.perTaskHint}>
                <Input name="perTask" inputMode="numeric" required pattern="[0-9]*" autoComplete="off" />
              </Field>
            </div>
            {routines.data.length > 0 ? (
              <Field label={w.routine}>
                <Select name="routineId" defaultValue="">
                  <option value="">{w.everyRound}</option>
                  {routines.data.map((r) => (
                    <option key={r.id} value={r.id}>
                      {`${r.due_time.slice(0, 5)} ${r.label}`}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : null}
            <SubmitButton variant="secondary" pendingLabel={w.adding}>
              {w.add}
            </SubmitButton>
          </ActionForm>
        </details>
      ) : null}
    </Section>
  );
}

/** What goes home of what the parent brought (M55), for the check-out step. */
export async function SuppliesGoingHome({ t, bookingId }: { t: I18n; bookingId: string }) {
  const { org } = await requireOrg();
  const w = t.m.supplies;
  const supabase = await createClient();
  const { data } = await supabase.from("stay_supply_left").select("kind, label, left_amount").eq("org_id", org.id).eq("booking_id", bookingId).gt("left_amount", 0);
  if (!data || data.length === 0) return null;
  const list = data.map((s) => `${s.label} (${supplyAmount(s.kind === "medicine" ? "medicine" : "food", s.left_amount ?? 0, w, t.locale)})`).join(", ");
  return <p className="mb-2 w-full font-semibold">{fill(w.goesHome, { list })}</p>;
}

/** A trial day (M56): day boarding marked as one, and how the dog settled. */
export async function TrialPanel({
  t,
  booking: b,
}: {
  t: I18n;
  booking: { id: string; kind: Enums<"booking_kind">; status: Enums<"booking_status">; is_trial: boolean; trial_outcome: Enums<"trial_outcome"> | null; trial_note: string | null };
}) {
  if (b.kind !== "daycare" || b.status === "cancelled" || b.status === "no_show") return null;
  const w = t.m.trial;
  const after = b.status === "checked_in" || b.status === "checked_out";
  if (!b.is_trial && b.status === "checked_out") return null;
  return (
    <Section title={w.title}>
      {b.is_trial ? null : <p className="mb-3 text-sm text-slate">{w.about}</p>}
      {b.is_trial && after ? (
        <ActionForm action={saveTrialOutcome} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <input type="hidden" name="bookingId" value={b.id} />
          <fieldset>
            <legend className="mb-1 font-semibold">{w.how}</legend>
            <div className="flex flex-wrap gap-2">
              {(["settled", "anxious", "reactive"] as const).map((o) => (
                <label key={o} className="flex min-h-12 items-center gap-2 rounded-lg border border-rule px-3">
                  <input type="radio" name="outcome" value={o} defaultChecked={b.trial_outcome === o} required className="size-5" />
                  <span>{w.outcomes[o]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <Field label={w.note}>
            <Input name="note" maxLength={300} defaultValue={b.trial_note ?? ""} />
          </Field>
          <SubmitButton variant="secondary" pendingLabel={t.m.common.saving}>
            {w.save}
          </SubmitButton>
        </ActionForm>
      ) : null}
      {b.status !== "checked_out" ? (
        <ActionForm action={setTrial} className="mt-3">
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="trial" value={b.is_trial ? "0" : "1"} />
          <SubmitButton variant={b.is_trial ? "quiet" : "secondary"} pendingLabel={t.m.common.saving}>
            {b.is_trial ? w.unmark : w.mark}
          </SubmitButton>
        </ActionForm>
      ) : null}
    </Section>
  );
}

/** The pet's last trial day and how it went (M56), shown at check-in and on the pet page. */
export async function LastTrial({ t, petId, exceptBooking }: { t: I18n; petId: string; exceptBooking?: string }) {
  const { org } = await requireOrg();
  const supabase = await createClient();
  let query = supabase
    .from("bookings")
    .select("id, start_date, trial_outcome, trial_note")
    .eq("org_id", org.id)
    .eq("pet_id", petId)
    .eq("is_trial", true)
    .not("trial_outcome", "is", null)
    .order("start_date", { ascending: false })
    .limit(1);
  if (exceptBooking) query = query.neq("id", exceptBooking);
  const { data } = await query;
  const last = data?.[0];
  if (!last?.trial_outcome) return null;
  const w = t.m.trial;
  return (
    <p className={`mb-3 rounded-lg px-4 py-3 font-semibold ${last.trial_outcome === "settled" ? "bg-leaf-soft text-leaf" : "bg-marigold-soft text-ink"}`}>
      {fill(w.result, { date: formatDate(last.start_date, t.locale), outcome: w.outcomes[last.trial_outcome] })}
      {last.trial_note ? <span className="block font-normal">{last.trial_note}</span> : null}
    </p>
  );
}

/** The stay report for staff once the pet has gone home (M53): the figures, words, photos and Send. */
export async function StayReportPanel({
  t,
  booking: b,
  petName,
  parent,
  stayUrl,
}: {
  t: I18n;
  booking: { id: string; kind: Enums<"booking_kind">; start_date: string; end_date: string; pet_id: string };
  petName: string;
  parent: { full_name: string; phone: string } | null;
  stayUrl: string;
}) {
  const { org } = await requireOrg();
  const w = t.m.stayReport;
  const supabase = await createClient();
  const [tasks, play, weights, incidents, updates, saved] = await Promise.all([
    supabase.from("care_tasks").select("kind, label, status").eq("org_id", org.id).eq("booking_id", b.id).in("kind", ["meal", "medication"]).order("task_date").order("due_time"),
    supabase.from("play_sessions").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("booking_id", b.id).eq("status", "done"),
    supabase
      .from("pet_weights")
      .select("weighed_on, weight_g")
      .eq("org_id", org.id)
      .eq("pet_id", b.pet_id)
      .gte("weighed_on", addDays(b.start_date, -30))
      .lte("weighed_on", b.end_date)
      .order("weighed_on")
      .order("created_at"),
    supabase.from("incidents").select("occurred_at, category").eq("org_id", org.id).eq("booking_id", b.id).not("parent_notified_at", "is", null).order("occurred_at"),
    supabase.from("stay_updates").select("media_paths").eq("org_id", org.id).eq("booking_id", b.id).eq("is_visible_to_parent", true).order("created_at"),
    supabase.from("stay_reports").select("words, photo_paths").eq("org_id", org.id).eq("booking_id", b.id).maybeSingle(),
  ]);
  if (tasks.error || weights.error || incidents.error || updates.error) return null;
  const report = stayReport({
    kind: b.kind,
    startDate: b.start_date,
    endDate: b.end_date,
    tasks: tasks.data,
    play: play.count ?? 0,
    weights: weights.data.map((x) => ({ on: x.weighed_on, grams: x.weight_g })),
    incidents: incidents.data.map((i) => ({ on: i.occurred_at.slice(0, 10), category: i.category })),
  });
  const photos = [...new Set(updates.data.flatMap((u) => u.media_paths))];
  const urls = await signedUrls(supabase, photos, { small: true });
  const picked = new Set(saved.data?.photo_paths ?? []);
  const p = parentI18n(org.parent_language, org.locale);
  const message = fill(p.m.stayReport.message, { name: parent?.full_name.split(" ")[0] ?? "", pet: petName, url: stayUrl, kennel: org.name });

  return (
    <Section title={w.title}>
      <p className="mb-3 text-sm text-slate">{fill(w.about, { pet: petName })}</p>
      <div className="mb-3 rounded-xl border border-rule bg-paper p-4">
        <ReportFigures m={t.m} language={t.language} locale={t.locale} kind={b.kind} report={report} />
      </div>
      <ActionForm action={saveStayReport} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        <input type="hidden" name="bookingId" value={b.id} />
        <Field label={w.words} hint={w.wordsHint}>
          <Textarea name="words" maxLength={1000} defaultValue={saved.data?.words ?? ""} />
        </Field>
        <fieldset>
          <legend className="mb-1 font-semibold">{w.photos}</legend>
          {photos.length === 0 ? (
            <p className="text-slate">{w.noPhotos}</p>
          ) : (
            <>
              <p className="mb-2 text-sm text-slate">{w.photosHint}</p>
              <div className="flex flex-wrap gap-3">
                {photos.map((path, i) =>
                  urls.get(path) ? (
                    <label key={path} className="flex min-h-12 flex-col items-center gap-1">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file */}
                      <img src={urls.get(path)} alt="" loading="lazy" className="size-20 rounded-lg object-cover" />
                      <input type="checkbox" name="photos" value={path} defaultChecked={picked.has(path)} className="size-5" aria-label={fill(w.photoLabel, { n: i + 1 })} />
                    </label>
                  ) : null,
                )}
              </div>
            </>
          )}
        </fieldset>
        <SubmitButton variant="secondary" pendingLabel={w.saving}>
          {w.save}
        </SubmitButton>
      </ActionForm>
      {parent ? (
        <a href={whatsappLink(message, parent.phone)} target="_blank" rel="noreferrer" className={`${buttonStyles.whatsapp} mt-3`}>
          {w.send}
        </a>
      ) : null}
    </Section>
  );
}

/** Vet visits during a stay (M57): the list, and a form for a new one. */
export async function VetVisits({
  t,
  bookingId,
  petName,
  parent,
  open,
}: {
  t: I18n;
  bookingId: string;
  petName: string;
  parent: { full_name: string; phone: string } | null;
  open: boolean;
}) {
  const { org, canManage } = await requireOrg();
  const w = t.m.vet;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("vet_visits")
    .select("id, visited_on, reason, vet, findings, cost_minor, booking_item_id, expense_id")
    .eq("org_id", org.id)
    .eq("booking_id", bookingId)
    .order("visited_on", { ascending: false });
  if (error) return null;
  if (!open && data.length === 0) return null;
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale: t.locale, trimZeros: true });
  const p = parentI18n(org.parent_language, org.locale);
  const today = todayIn(org.time_zone);

  return (
    <Section title={w.title} count={data.length}>
      {data.length === 0 ? (
        <Empty>{w.none}</Empty>
      ) : (
        <ul className="space-y-3">
          {data.map((v) => (
            <li key={v.id} className="rounded-xl border border-rule bg-paper p-4">
              <p className="font-bold">{fill(w.visitLine, { date: formatDate(v.visited_on, t.locale), reason: v.reason })}</p>
              {v.vet ? <p className="text-slate">{fill(w.by, { vet: v.vet })}</p> : null}
              {v.findings ? <p className="mt-1 whitespace-pre-line">{v.findings}</p> : null}
              {v.cost_minor > 0 ? (
                <p className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="tabular-nums">{money(v.cost_minor)}</span>
                  {v.booking_item_id ? <Badge tone="good">{w.onBill}</Badge> : null}
                  {v.expense_id ? <Badge tone="good">{w.onExpenses}</Badge> : null}
                </p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-2">
                {parent ? (
                  <a
                    href={whatsappLink(
                      fill(p.m.vet.message, { name: parent.full_name.split(" ")[0], pet: petName, reason: v.reason, findings: v.findings ?? "", kennel: org.name }),
                      parent.phone,
                    )}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonStyles.whatsapp}
                  >
                    {w.tell}
                  </a>
                ) : null}
                {canManage && v.cost_minor > 0 && !v.expense_id ? (
                  <ActionForm action={costToExpense} className="contents">
                    <input type="hidden" name="kind" value="vet" />
                    <input type="hidden" name="id" value={v.id} />
                    <SubmitButton variant="secondary" pendingLabel={w.writing}>
                      {w.toExpense}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </div>
            </li>
          ))}
        </ul>
      )}
      {open ? (
        <details className="mt-3 rounded-xl border border-rule bg-paper p-4">
          <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold">{w.add}</summary>
          <ActionForm action={recordVetVisit} className="mt-2 space-y-4">
            <input type="hidden" name="bookingId" value={bookingId} />
            <p className="text-sm text-slate">
              {fill(w.about, { pet: petName })} {canManage ? null : w.staffNote}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={w.day}>
                <Input name="day" type="date" required defaultValue={today} max={today} />
              </Field>
              <Field label={w.reason} hint={w.reasonHint}>
                <Input name="reason" required maxLength={300} />
              </Field>
              <Field label={w.vet}>
                <Input name="vet" maxLength={120} />
              </Field>
              <Field label={w.cost} hint={w.costHint}>
                <Input name="cost" inputMode="decimal" autoComplete="off" />
              </Field>
            </div>
            <Field label={w.findings}>
              <Textarea name="findings" maxLength={2000} />
            </Field>
            <fieldset className="space-y-3">
              <legend className="mb-1 font-semibold">{w.medicines}</legend>
              {[1, 2, 3].map((n) => (
                <div key={n} className="grid gap-3 sm:grid-cols-3">
                  <Field label={fill(w.medicine, { n })}>
                    <Input name={`med${n}`} maxLength={80} />
                  </Field>
                  <Field label={w.medicineHow}>
                    <Input name={`med${n}How`} maxLength={300} />
                  </Field>
                  <Field label={w.medicineTime}>
                    <Input name={`med${n}Time`} type="time" />
                  </Field>
                </div>
              ))}
            </fieldset>
            <SubmitButton pendingLabel={w.saving}>{w.save}</SubmitButton>
          </ActionForm>
        </details>
      ) : null}
    </Section>
  );
}

/** Every vet visit of a pet (M57), on its page: part of its health record. */
export async function PetVetVisits({ t, petId }: { t: I18n; petId: string }) {
  const { org } = await requireOrg();
  const w = t.m.vet;
  const supabase = await createClient();
  const { data } = await supabase
    .from("vet_visits")
    .select("id, visited_on, reason, vet, findings, booking_id")
    .eq("org_id", org.id)
    .eq("pet_id", petId)
    .order("visited_on", { ascending: false })
    .limit(50);
  if (!data || data.length === 0) return null;
  return (
    <Section title={w.title} count={data.length}>
      <ul className="space-y-3">
        {data.map((v) => (
          <li key={v.id} className="rounded-xl border border-rule bg-paper p-4">
            <p className="font-bold">{fill(w.visitLine, { date: formatDate(v.visited_on, t.locale), reason: v.reason })}</p>
            {v.vet ? <p className="text-slate">{fill(w.by, { vet: v.vet })}</p> : null}
            {v.findings ? <p className="mt-1 whitespace-pre-line">{v.findings}</p> : null}
          </li>
        ))}
      </ul>
    </Section>
  );
}

/**
 * A pet that has passed away (M52), on its page for owners and managers: mark
 * it with the day, or undo it within a week of marking.
 */
export function PassingPanel({
  t,
  pet,
  canManage,
  canUndo,
}: {
  t: I18n;
  pet: { id: string; name: string; passed_away_on: string | null };
  /** Owners and managers undo it, within a week of marking it. */
  canManage: boolean;
  canUndo: boolean;
}) {
  const w = t.m.passing;
  if (pet.passed_away_on) {
    return (
      <div className="mb-5 space-y-3 rounded-xl border border-rule bg-ground p-4">
        <p className="font-bold">{fill(w.banner, { pet: pet.name, date: formatDate(pet.passed_away_on, t.locale) })}</p>
        {canManage && canUndo ? (
          <ActionForm action={undoPassedAway} className="space-y-2">
            <input type="hidden" name="petId" value={pet.id} />
            <p className="text-sm text-slate">{w.undoHint}</p>
            <SubmitButton variant="quiet" pendingLabel={w.marking}>
              {w.undo}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </div>
    );
  }
  return null;
}

/** The form that marks a pet as passed away (M52), at the foot of its page, for owners and managers. */
export function MarkPassedAway({ t, pet, today }: { t: I18n; pet: { id: string; name: string }; today: string }) {
  const w = t.m.passing;
  return (
    <Section title={w.title}>
      <details className="rounded-xl border border-rule bg-paper p-4">
        <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold">{w.mark}</summary>
        <ActionForm action={markPassedAway} className="mt-2 space-y-3">
          <input type="hidden" name="petId" value={pet.id} />
          <p>{fill(w.about, { pet: pet.name })}</p>
          <Field label={w.day}>
            <Input name="day" type="date" required defaultValue={today} max={today} />
          </Field>
          <SubmitButton variant="secondary" pendingLabel={w.marking}>
            {w.mark}
          </SubmitButton>
        </ActionForm>
      </details>
    </Section>
  );
}
