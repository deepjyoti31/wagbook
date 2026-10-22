import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Empty, Loading, PageTitle, Section, Textarea } from "@/components/ui";
import { Rich } from "@/components/rich";
import { requireOrg } from "@/lib/auth";
import { flagText } from "@/lib/bookings";
import { CARE_KINDS, clockText } from "@/lib/care";
import { dailyGrams, formatDate, todayIn } from "@/lib/core";
import { portionSettings } from "@/lib/kitchen";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import type { Enums } from "@/lib/supabase/database.types";
import type { Messages } from "@/messages";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { PetAvatar } from "@/components/pet-avatar";
import { TickButton } from "@/components/tick-button";
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
  "id, kind, label, details, due_time, status, note, done_at, bookings(id, pet_id, kennels(name, sort_order), pets(name, flags, photo_path, weight_g))" as const;

async function Care({ searchParams }: Pick<PageProps<"/app/care">, "searchParams">) {
  const params = await searchParams;
  const kindParam = typeof params.kind === "string" ? params.kind : null;
  const kind = CARE_KINDS.find((k) => k === kindParam) ?? null;
  const pendingOnly = params.show === "pending";

  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, language, locale } = t;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  // Today's tasks are made when someone first looks. Safe to repeat.
  const generated = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: today });
  if (generated.error) console.error("generate_care_tasks failed", generated.error.message);

  let query = supabase.from("care_tasks").select(TASK).eq("org_id", org.id).eq("task_date", today).limit(5000);
  if (kind) query = query.eq("kind", kind);
  const { data, error } = await query;
  if (error) throw new Error("Could not load today's care.");

  // Walking order: by time, then medicines first, then kennel by kennel along the row.
  const tasks = [...data].sort(
    (a, b) =>
      (a.due_time ?? "99").localeCompare(b.due_time ?? "99") ||
      Number(b.kind === "medication") - Number(a.kind === "medication") ||
      (a.bookings?.kennels?.sort_order ?? 1e9) - (b.bookings?.kennels?.sort_order ?? 1e9) ||
      (a.bookings?.kennels?.name ?? "").localeCompare(b.bookings?.kennels?.name ?? "") ||
      (a.bookings?.pets?.name ?? "").localeCompare(b.bookings?.pets?.name ?? ""),
  );
  const shown = pendingOnly ? tasks.filter((t) => t.status === "pending") : tasks;
  const photos = await signedUrls(supabase, shown.map((t) => t.bookings?.pets?.photo_path), { small: true });
  const pending = tasks.filter((t) => t.status === "pending").length;

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

  const groups = new Map<string, typeof shown>();
  for (const t of shown) {
    const key = clockText(m, t.due_time);
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }

  const filter = (k: Enums<"care_kind"> | null, pend: boolean) => {
    const q = new URLSearchParams();
    if (k) q.set("kind", k);
    if (pend) q.set("show", "pending");
    const s = q.toString();
    return s ? `/app/care?${s}` : "/app/care";
  };
  const chip = (active: boolean) =>
    `inline-flex min-h-12 items-center rounded-lg px-4 font-semibold ${active ? "bg-ink text-paper" : "border border-rule bg-paper text-ink"}`;

  // {n} is left in place by plural() so that Rich can draw it in bold.
  const summary = plural(language, pending, kind ? m.care.stillToDoOfKind : m.care.stillToDo, {
    n: "{n}",
    date: formatDate(today, locale),
    kind: kind ? m.labels.careKindPlural[kind].toLowerCase() : "",
  });

  return (
    <>
      <PageTitle title={m.care.title}>
        <Link href="/app/play" className={buttonStyles.secondary}>
          {m.play.title}
        </Link>
      </PageTitle>
      <p className="mb-4 text-lg">
        <Rich text={summary} parts={{ n: <strong className="font-extrabold">{pending}</strong> }} />
      </p>

      <nav aria-label={m.common.show} className="mb-5 flex flex-wrap gap-2">
        <Link href={filter(kind, !pendingOnly)} className={chip(pendingOnly)} aria-pressed={pendingOnly}>
          {m.care.showStillToDo}
        </Link>
        <Link href={filter(null, pendingOnly)} className={chip(kind === null)}>
          {m.care.showEverything}
        </Link>
        {CARE_KINDS.filter((k) => data.some((t) => t.kind === k) || k === kind).map((k) => (
          <Link key={k} href={filter(k, pendingOnly)} className={chip(kind === k)}>
            {m.labels.careKindPlural[k]}
          </Link>
        ))}
      </nav>

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
        [...groups.entries()].map(([time, list]) => (
          <Section key={time} title={time} count={list.filter((t) => t.status === "pending").length}>
            <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
              {list.map((t) => (
                <TaskRow
                  key={t.id}
                  m={m}
                  task={t}
                  photo={t.bookings?.pets?.photo_path ? photos.get(t.bookings.pets.photo_path) : null}
                  food={t.kind === "meal" && t.bookings?.pet_id ? foodOf.get(t.bookings.pet_id) : undefined}
                />
              ))}
            </ul>
          </Section>
        ))
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
  bookings: { id: string; kennels: { name: string } | null; pets: { name: string; flags: string[]; photo_path: string | null } | null } | null;
};

function TaskRow({ m, task: t, photo, food }: { m: Messages; task: Task; photo?: string | null; food?: string }) {
  const medicine = t.kind === "medication";
  const pet = t.bookings?.pets;
  return (
    <li className={`px-4 py-3 ${medicine && t.status === "pending" ? "border-l-4 border-alert bg-alert-soft" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PetAvatar name={pet?.name ?? "?"} url={photo} />
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex flex-wrap items-center gap-2">
            <DoorTag name={t.bookings?.kennels?.name} empty={m.common.noKennel} />
            <span className="text-lg font-bold">{pet?.name ?? m.care.pet}</span>
            <span className={medicine ? "font-bold text-alert" : "font-semibold"}>{t.label}</span>
            {medicine ? <Badge tone="alert">{m.labels.careKind.medication}</Badge> : null}
            {t.status === "done" ? <Badge tone="good">{m.labels.taskStatus.done}</Badge> : null}
            {t.status === "skipped" ? <Badge tone="attention">{m.labels.taskStatus.skipped}</Badge> : null}
            {(pet?.flags ?? []).map((f) => (
              <Badge key={f} tone="alert">
                {flagText(m, f)}
              </Badge>
            ))}
          </p>
          {food ? <p className="mt-1 font-semibold">{food}</p> : null}
          {t.details ? <p className="mt-1">{t.details}</p> : null}
          {t.note ? <p className="mt-1 text-slate">{fill(m.care.note, { note: t.note })}</p> : null}
        </div>
        {t.status === "pending" ? (
          // Saved on the phone when offline, and sent when the connection is back (D22).
          <TickButton taskId={t.id} action={markDone} words={m.offline} label={m.care.markDone} pendingLabel={m.common.saving} />
        ) : (
          <ActionForm action={undoTask} className="contents">
            <input type="hidden" name="taskId" value={t.id} />
            <SubmitButton variant="quiet" pendingLabel={m.care.undoing}>
              {m.care.undo}
            </SubmitButton>
          </ActionForm>
        )}
      </div>
      {t.status === "pending" ? (
        <details className="mt-2">
          <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold text-slate underline underline-offset-4">{m.care.skip}</summary>
          <ActionForm action={skipTask} className="mt-2 space-y-2">
            <input type="hidden" name="taskId" value={t.id} />
            <input type="hidden" name="kind" value={t.kind} />
            <label className="block">
              <span className="mb-1 block font-semibold">{medicine ? m.care.whyNotGiven : m.care.whyOptional}</span>
              <Textarea name="note" rows={2} maxLength={500} required={medicine} />
            </label>
            <SubmitButton variant="secondary" pendingLabel={m.care.skipping}>
              {fill(m.care.skipTask, { task: t.label.toLowerCase() })}
            </SubmitButton>
          </ActionForm>
        </details>
      ) : null}
    </li>
  );
}
