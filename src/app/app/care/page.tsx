import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Empty, Loading, PageTitle, Textarea } from "@/components/ui";
import { Icon } from "@/components/icons";
import { Rich } from "@/components/rich";
import { requireOrg } from "@/lib/auth";
import { flagText } from "@/lib/bookings";
import { CARE_KINDS, clockText, isLate } from "@/lib/care";
import { dailyGrams, formatWeekday, localClock, todayIn } from "@/lib/core";
import { portionSettings } from "@/lib/kitchen";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import type { Enums } from "@/lib/supabase/database.types";
import type { Messages } from "@/messages";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { TickButton } from "@/components/tick-button";
import { PhotoInput } from "@/components/photo-input";
import { HouseJobs } from "@/components/today-day";
import { completeWithPhoto, shareProof } from "@/app/app/media/actions";
import type { I18n } from "@/lib/i18n-server";
import { markDone, skipTask, undoTask } from "./actions";

export const generateMetadata = () => appTitle((m) => m.care.title);

export default function CarePage({ searchParams }: PageProps<"/app/care">) {
  return (
    <Suspense fallback={<Loading />}>
      <Care searchParams={searchParams} />
    </Suspense>
  );
}

const TASK =
  "id, kind, label, details, due_time, status, note, done_at, needs_photo, photo_path, bookings(id, pet_id, kennels(name, sort_order), pets(name, flags, photo_path, weight_g))" as const;

async function Care({ searchParams }: Pick<PageProps<"/app/care">, "searchParams">) {
  const params = await searchParams;
  const kindParam = typeof params.kind === "string" ? params.kind : null;
  const kind = CARE_KINDS.find((k) => k === kindParam) ?? null;
  // What is still to do is what the round is for, so it is what opens; "Everything" is asked for.
  const pendingOnly = params.show !== "all";
  // The task whose Skip was tapped: its row opens to ask why.
  const skipId = typeof params.skip === "string" ? params.skip : null;

  const { org } = await requireOrg();
  const t = await getAppI18n();
  const i18n = t;
  const { m, locale } = t;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  // Today's tasks are made when someone first looks. Safe to repeat.
  const generated = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: today });
  if (generated.error) console.error("generate_care_tasks failed", generated.error.message);

  // Every kind is read, so each chip can say how many it has left; the one asked for is picked out below.
  const { data, error } = await supabase.from("care_tasks").select(TASK).eq("org_id", org.id).eq("task_date", today).limit(5000);
  if (error) throw new Error("Could not load today's care.");

  // Walking order: by time, then medicines first, then kennel by kennel along the row.
  const all = [...data].sort(
    (a, b) =>
      (a.due_time ?? "99").localeCompare(b.due_time ?? "99") ||
      Number(b.kind === "medication") - Number(a.kind === "medication") ||
      (a.bookings?.kennels?.sort_order ?? 1e9) - (b.bookings?.kennels?.sort_order ?? 1e9) ||
      (a.bookings?.kennels?.name ?? "").localeCompare(b.bookings?.kennels?.name ?? "") ||
      (a.bookings?.pets?.name ?? "").localeCompare(b.bookings?.pets?.name ?? ""),
  );
  const tasks = kind ? all.filter((t) => t.kind === kind) : all;
  const shown = pendingOnly ? tasks.filter((t) => t.status === "pending") : tasks;
  const photos = await signedUrls(supabase, shown.map((t) => t.photo_path), { small: true });
  const pending = tasks.filter((t) => t.status === "pending").length;
  // Done out of what is owed: a task skipped on purpose is no longer owed.
  const owed = tasks.filter((t) => t.status !== "skipped");
  const doneCount = owed.filter((t) => t.status === "done").length;
  const leftOf = (k: Enums<"care_kind">) => all.filter((t) => t.kind === k && t.status === "pending").length;

  // What each pet eats, on its meals, while the kennel has a kitchen (M28): the care round follows it.
  const mealPets = [...new Set(shown.filter((t) => t.kind === "meal" && t.bookings?.pet_id).map((t) => t.bookings!.pet_id))];
  const foodOf = new Map<string, string>();
  if (org.offers_kitchen && mealPets.length > 0) {
    const food = await supabase.from("pet_food").select("pet_id, plan, goal, grams_by_hand, boarder_food, kibble_brand, kibble_g_per_day").eq("org_id", org.id).in("pet_id", mealPets);
    const rows = new Map((food.data ?? []).map((f) => [f.pet_id, f]));
    for (const t of shown) {
      const id = t.bookings?.pet_id;
      if (!id || foodOf.has(id)) continue;
      const f = rows.get(id) ?? null;
      const grams = dailyGrams({ weight_g: t.bookings?.pets?.weight_g ?? null }, f, portionSettings(org));
      foodOf.set(
        id,
        f?.boarder_food === "kibble"
          ? fill(m.careFood.kibble, { brand: f.kibble_brand ?? "", grams: f.kibble_g_per_day ?? "" })
          : f?.boarder_food === "own"
            ? m.careFood.own
            : grams
              ? fill(m.careFood.kitchen, { grams })
              : m.careFood.kitchenNoWeight,
      );
    }
  }

  // What is late comes first, on its own. Then the round in walking order: each time, and what is done at it
  // ("13:00 Lunch"), with a time's medicines together under "Medicines".
  const now = localClock(new Date(), org.time_zone);
  const late = shown.filter((t) => t.status === "pending" && isLate(t.due_time, now));
  const groups = new Map<string, { title: string; medicine: boolean; list: typeof shown }>();
  for (const t of shown) {
    if (late.includes(t)) continue;
    const what = t.kind === "medication" ? m.labels.careKindPlural.medication : t.label;
    const key = `${t.due_time ?? ""}|${what.toLowerCase()}`;
    const group = groups.get(key) ?? { title: `${clockText(m, t.due_time)} ${what}`, medicine: t.kind === "medication", list: [] };
    group.list.push(t);
    groups.set(key, group);
  }

  const filter = (k: Enums<"care_kind"> | null, pend: boolean) => {
    const q = new URLSearchParams();
    if (k) q.set("kind", k);
    if (!pend) q.set("show", "all");
    const s = q.toString();
    return s ? `/app/care?${s}` : "/app/care";
  };
  const chip = (active: boolean, medicine = false) =>
    `inline-flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-full border px-3.5 text-sm font-bold ${
      active ? "border-ink bg-ink text-paper" : medicine ? "border-[#e9a29c] bg-alert-soft text-alert-ink" : "border-rule-strong bg-paper text-ink hover:bg-wash"
    }`;
  const row = (t: (typeof shown)[number], showLabel: boolean) => (
    <TaskRow
      key={t.id}
      i18n={i18n}
      task={t}
      showLabel={showLabel}
      skipping={skipId === t.id}
      skipHref={`${filter(kind, pendingOnly)}${kind || !pendingOnly ? "&" : "?"}skip=${t.id}`}
      backHref={filter(kind, pendingOnly)}
      proof={t.photo_path ? photos.get(t.photo_path) : null}
      food={t.kind === "meal" && t.bookings?.pet_id ? foodOf.get(t.bookings.pet_id) : undefined}
    />
  );
  const progress = (
    <span className="block h-2 overflow-hidden rounded-full bg-[#2c3b5f] sm:bg-track">
      <span className="block h-full rounded-full bg-marigold sm:bg-leaf" style={{ width: `${owed.length > 0 ? Math.round((doneCount / owed.length) * 100) : 0}%` }} />
    </span>
  );

  return (
    <>
      {/* Phone: the round's count on a dark bar, in place of the kennel's name. */}
      <header className="wb-dark -mx-4 -mt-[18px] mb-3.5 flex flex-col gap-3 bg-ink px-4 pb-4 pt-3.5 text-paper sm:hidden">
        <div className="flex items-center gap-2.5">
          <div className="min-w-0 flex-1">
            <p className="text-[13.5px] font-semibold text-[#c9d1e0]">{formatWeekday(today, locale)}</p>
            <h1 className="text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em]">{m.care.title}</h1>
          </div>
          <div className="text-right">
            <p className="text-[26px] font-extrabold leading-[1.1]">{pending}</p>
            <p className="text-[13px] text-[#c9d1e0]">{m.care.leftToDo}</p>
          </div>
        </div>
        {progress}
        <p className="text-[13.5px] text-[#c9d1e0]">{fill(m.today.careDone, { done: doneCount, total: owed.length })}</p>
      </header>
      {/* Tablet and laptop: the same count as a card under the page's heading. */}
      <div className="hidden sm:block">
        <PageTitle eyebrow={formatWeekday(today, locale)} title={m.care.title}>
          <Link href="/app/play" className={buttonStyles.secondary}>
            {m.play.title}
          </Link>
        </PageTitle>
        <div className="mb-(--wb-gap) flex items-center gap-5 rounded-2xl border border-rule bg-paper px-(--wb-pad) py-4">
          <p className="whitespace-nowrap">
            <strong className="text-[28px] font-extrabold leading-none tracking-[-0.02em] lg:text-[34px]">{pending}</strong> <span className="text-sm font-[650] text-slate">{m.care.leftToDo}</span>
          </p>
          <div className="min-w-0 flex-1">{progress}</div>
          <p className="whitespace-nowrap text-sm text-slate">{fill(m.today.careDone, { done: doneCount, total: owed.length })}</p>
        </div>
      </div>

      <nav aria-label={m.common.show} className="mb-3.5 flex gap-1 rounded-xl bg-track p-1 sm:max-w-sm">
        {[
          { on: pendingOnly, href: filter(kind, true), label: m.care.showStillToDo },
          { on: !pendingOnly, href: filter(kind, false), label: m.care.showEverything },
        ].map((x) => (
          <Link
            key={x.label}
            href={x.href}
            aria-current={x.on ? "page" : undefined}
            className={`inline-flex min-h-11 flex-1 items-center justify-center rounded-[9px] text-[15px] font-[650] ${x.on ? "bg-paper text-ink shadow-[0_1px_2px_rgba(20,33,61,0.12)]" : "text-steel"}`}
          >
            {x.label}
          </Link>
        ))}
      </nav>

      <nav aria-label={m.care.title} className="-mx-4 mb-3.5 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
        <Link href={filter(null, pendingOnly)} className={chip(kind === null)} aria-current={kind === null ? "true" : undefined}>
          {m.care.all} <span className="font-extrabold opacity-75">{all.filter((t) => t.status === "pending").length}</span>
        </Link>
        {CARE_KINDS.filter((k) => data.some((t) => t.kind === k) || k === kind).map((k) => (
          <Link key={k} href={filter(k, pendingOnly)} className={chip(kind === k, k === "medication" && leftOf(k) > 0)} aria-current={kind === k ? "true" : undefined}>
            {m.labels.careKindPlural[k]} {leftOf(k) > 0 ? <span className="font-extrabold opacity-75">{leftOf(k)}</span> : null}
          </Link>
        ))}
        <Link href="/app/play" className={`${chip(false)} sm:hidden`}>
          {m.play.title}
        </Link>
      </nav>

      {kind === null || kind === "cleaning" ? (
        <Suspense fallback={null}>
          <HouseJobs t={t} today={today} lists={["cleaning"]} />
        </Suspense>
      ) : null}

      {tasks.length === 0 ? (
        <Empty>
          <Rich
            text={m.care.nothingYet}
            parts={{
              link: (
                <Link href="/app/more/routines" className="font-semibold text-ink underline underline-offset-4">
                  {m.care.dailyRoutines}
                </Link>
              ),
            }}
          />
        </Empty>
      ) : shown.length === 0 ? (
        <Empty>{m.care.allDone}</Empty>
      ) : (
        <>
          {late.length > 0 ? (
            <section aria-labelledby="care-late" className="mb-3.5">
              <div className="flex items-baseline gap-2 px-1 pb-2 pt-1.5">
                <h2 id="care-late" className="text-[15px] font-extrabold text-alert-ink">
                  {m.care.late}
                </h2>
                <span className="text-sm text-slate">{fill(m.care.due, { time: clockText(m, late[0].due_time) })}</span>
              </div>
              <ul className="divide-y divide-rule-soft overflow-hidden rounded-2xl border-2 border-alert bg-paper">{late.map((t) => row(t, true))}</ul>
            </section>
          ) : null}
          {[...groups.entries()].map(([key, g], n) => (
            <section key={key} aria-labelledby={`care-${n}`} className="mb-3.5">
              <div className="flex items-baseline gap-2 px-1 pb-2 pt-1.5">
                <h2 id={`care-${n}`} className="text-[15px] font-extrabold">
                  {g.title}
                </h2>
              </div>
              <ul className="divide-y divide-rule-soft overflow-hidden rounded-2xl border border-rule bg-paper">{g.list.map((t) => row(t, g.medicine))}</ul>
            </section>
          ))}
          {pendingOnly && doneCount > 0 ? (
            <Link href={filter(kind, false)} className="flex min-h-[52px] items-center justify-center gap-2 rounded-[14px] border border-dashed border-[#b7c0d0] font-[650] text-steel">
              <Icon name="check" className="size-[18px]" />
              {fill(m.care.doneToday, { n: doneCount })}
            </Link>
          ) : null}
        </>
      )}
    </>
  );
}

type Task = {
  id: string;
  kind: Enums<"care_kind">;
  label: string;
  details: string | null;
  status: Enums<"task_status">;
  note: string | null;
  needs_photo: boolean;
  photo_path: string | null;
  bookings: { id: string; kennels: { name: string } | null; pets: { name: string; flags: string[]; photo_path: string | null } | null } | null;
};

/**
 * One task on the round: the kennel's tag and the pet, how to do it, and Done.
 * `showLabel` names the task on the row, where the heading above does not
 * (what is late, and a time's medicines).
 */
function TaskRow({
  i18n,
  task: t,
  showLabel,
  skipping,
  skipHref,
  backHref,
  proof,
  food,
}: {
  i18n: I18n;
  task: Task;
  showLabel: boolean;
  /** Skip was tapped on this task: ask why under it. */
  skipping: boolean;
  skipHref: string;
  backHref: string;
  proof?: string | null;
  food?: string;
}) {
  const m: Messages = i18n.m;
  const medicine = t.kind === "medication";
  const pet = t.bookings?.pets;
  const pending = t.status === "pending";
  return (
    <li className={`py-3 pl-4 pr-3 ${medicine && pending ? "bg-[#fdf6f5]" : ""}`}>
      <div className="flex items-center gap-3">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <p className="flex flex-wrap items-center gap-2">
            <DoorTag name={t.bookings?.kennels?.name} empty={m.common.noKennel} />
            <strong className="text-[16.5px]">{pet?.name ?? m.care.pet}</strong>
            {t.needs_photo ? <Badge>{m.proof.needsPhoto}</Badge> : null}
            {t.status === "done" ? <Badge tone="good">{m.labels.taskStatus.done}</Badge> : null}
            {t.status === "skipped" ? <Badge tone="attention">{m.labels.taskStatus.skipped}</Badge> : null}
            {(pet?.flags ?? []).map((f) => (
              <Badge key={f} tone="alert">
                {flagText(m, f)}
              </Badge>
            ))}
          </p>
          {showLabel ? <p className={`font-[650] ${medicine ? "text-alert-ink" : ""}`}>{t.label}</p> : null}
          {food ? <p className="text-sm font-[650]">{food}</p> : null}
          {t.details ? <p className="text-sm text-slate">{t.details}</p> : null}
          {t.note ? <p className="text-sm text-slate">{fill(m.care.note, { note: t.note })}</p> : null}
        </div>
        {pending ? (
          <div className="flex flex-col items-stretch gap-0.5">
            {t.needs_photo ? null : (
              // Saved on the phone when offline, and sent when the connection is back (D22).
              <TickButton
                taskId={t.id}
                action={markDone}
                words={m.offline}
                label={m.care.markDone}
                pendingLabel={m.common.saving}
                ariaLabel={fill(m.care.doneLabel, { task: t.label, pet: pet?.name ?? m.care.pet })}
              />
            )}
            {/* Skip is offered on what is late and on medicines, which need a reason; any task can be skipped from its stay's page. */}
            {showLabel && !skipping ? (
              <Link href={skipHref} scroll={false} className={`${buttonStyles.quiet} min-h-11! text-steel!`} aria-label={fill(m.care.skipTask, { task: t.label.toLowerCase() })}>
                {m.care.skip}
              </Link>
            ) : null}
          </div>
        ) : (
          <ActionForm action={undoTask} className="contents">
            <input type="hidden" name="taskId" value={t.id} />
            <SubmitButton variant="quiet" pendingLabel={m.care.undoing}>
              {m.care.undo}
            </SubmitButton>
          </ActionForm>
        )}
      </div>
      {pending && t.needs_photo ? (
        // A task that asks for a photo is done with it (M54); it needs the connection.
        <ActionForm action={completeWithPhoto} className="mt-3 space-y-2">
          <input type="hidden" name="taskId" value={t.id} />
          <PhotoInput name="photo" label={m.proof.addPhoto} words={m.photos} />
          <SubmitButton pendingLabel={m.proof.saving}>{m.proof.doneWithPhoto}</SubmitButton>
        </ActionForm>
      ) : null}
      {proof ? (
        <div className="mt-2 flex flex-wrap items-center gap-3">
          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file */}
          <img src={proof} alt={fill(m.proof.photoAlt, { task: t.label })} loading="lazy" className="size-20 rounded-lg object-cover" />
          <ActionForm action={shareProof} className="contents">
            <input type="hidden" name="taskId" value={t.id} />
            <SubmitButton variant="quiet" pendingLabel={m.proof.sharing}>
              {m.proof.share}
            </SubmitButton>
          </ActionForm>
        </div>
      ) : null}
      {pending && skipping ? (
        <ActionForm action={skipTask} className="mt-3 space-y-2">
          <input type="hidden" name="taskId" value={t.id} />
          <input type="hidden" name="kind" value={t.kind} />
          <label className="block">
            <span className="mb-1 block font-semibold">{medicine ? m.care.whyNotGiven : m.care.whyOptional}</span>
            <Textarea name="note" rows={2} maxLength={500} required={medicine} autoFocus />
          </label>
          <div className="flex flex-wrap gap-2">
            <SubmitButton variant="secondary" pendingLabel={m.care.skipping}>
              {fill(m.care.skipTask, { task: t.label.toLowerCase() })}
            </SubmitButton>
            <Link href={backHref} scroll={false} className={buttonStyles.quiet}>
              {m.common.cancel}
            </Link>
          </div>
        </ActionForm>
      ) : null}
    </li>
  );
}
