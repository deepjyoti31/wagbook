import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Empty, Loading, PageTitle, Section, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { flagText } from "@/lib/bookings";
import { CARE_KIND_LABEL, CARE_KIND_PLURAL, CARE_KINDS, clockText } from "@/lib/care";
import { formatDate, todayIn } from "@/lib/core";
import type { Enums } from "@/lib/supabase/database.types";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { PetAvatar } from "@/components/pet-avatar";
import { markDone, skipTask, undoTask } from "./actions";

export const metadata: Metadata = { title: "Care" };

export default function CarePage({ searchParams }: PageProps<"/app/care">) {
  return (
    <>
      <PageTitle title="Care">
        <Link href="/app/play" className={buttonStyles.secondary}>
          Play
        </Link>
      </PageTitle>
      <Suspense fallback={<Loading label="Loading today's care" />}>
        <Care searchParams={searchParams} />
      </Suspense>
    </>
  );
}

const TASK =
  "id, kind, label, details, due_time, status, note, done_at, bookings(id, kennels(name, sort_order), pets(name, flags, photo_path))" as const;

async function Care({ searchParams }: Pick<PageProps<"/app/care">, "searchParams">) {
  const params = await searchParams;
  const kindParam = typeof params.kind === "string" ? params.kind : null;
  const kind = CARE_KINDS.find((k) => k === kindParam) ?? null;
  const pendingOnly = params.show === "pending";

  const { org } = await requireOrg();
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

  const groups = new Map<string, typeof shown>();
  for (const t of shown) {
    const key = clockText(t.due_time);
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

  return (
    <>
      <p className="mb-4 text-lg">
        {formatDate(today)}. <strong className="font-extrabold">{pending}</strong> {pending === 1 ? "task" : "tasks"} still to do
        {kind ? ` (${CARE_KIND_PLURAL[kind].toLowerCase()})` : ""}.
      </p>

      <nav aria-label="Show" className="mb-5 flex flex-wrap gap-2">
        <Link href={filter(kind, !pendingOnly)} className={chip(pendingOnly)} aria-pressed={pendingOnly}>
          Still to do
        </Link>
        <Link href={filter(null, pendingOnly)} className={chip(kind === null)}>
          Everything
        </Link>
        {CARE_KINDS.filter((k) => data.some((t) => t.kind === k) || k === kind).map((k) => (
          <Link key={k} href={filter(k, pendingOnly)} className={chip(kind === k)}>
            {CARE_KIND_PLURAL[k]}
          </Link>
        ))}
      </nav>

      {tasks.length === 0 ? (
        <Empty>
          Nothing to do yet. Tasks come from your{" "}
          <Link href="/app/more/routines" className="font-semibold text-ink underline underline-offset-4">
            daily routines
          </Link>{" "}
          for every pet checked in.
        </Empty>
      ) : shown.length === 0 ? (
        <Empty>All done.</Empty>
      ) : (
        [...groups.entries()].map(([time, list]) => (
          <Section key={time} title={time} count={list.filter((t) => t.status === "pending").length}>
            <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
              {list.map((t) => (
                <TaskRow key={t.id} task={t} photo={t.bookings?.pets?.photo_path ? photos.get(t.bookings.pets.photo_path) : null} />
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

function TaskRow({ task: t, photo }: { task: Task; photo?: string | null }) {
  const medicine = t.kind === "medication";
  const pet = t.bookings?.pets;
  return (
    <li className={`px-4 py-3 ${medicine && t.status === "pending" ? "border-l-4 border-alert bg-alert-soft" : ""}`}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <PetAvatar name={pet?.name ?? "?"} url={photo} />
        <div className="min-w-0 flex-1 basis-48">
          <p className="flex flex-wrap items-center gap-2">
            <DoorTag name={t.bookings?.kennels?.name} />
            <span className="text-lg font-bold">{pet?.name ?? "Pet"}</span>
            <span className={medicine ? "font-bold text-alert" : "font-semibold"}>{t.label}</span>
            {medicine ? <Badge tone="alert">{CARE_KIND_LABEL.medication}</Badge> : null}
            {t.status === "done" ? <Badge tone="good">Done</Badge> : null}
            {t.status === "skipped" ? <Badge tone="attention">Skipped</Badge> : null}
            {(pet?.flags ?? []).map((f) => (
              <Badge key={f} tone="alert">
                {flagText(f)}
              </Badge>
            ))}
          </p>
          {t.details ? <p className="mt-1">{t.details}</p> : null}
          {t.note ? <p className="mt-1 text-slate">Note: {t.note}</p> : null}
        </div>
        {t.status === "pending" ? (
          <ActionForm action={markDone} className="contents">
            <input type="hidden" name="taskId" value={t.id} />
            <SubmitButton pendingLabel="Saving" className="min-w-28">
              Done
            </SubmitButton>
          </ActionForm>
        ) : (
          <ActionForm action={undoTask} className="contents">
            <input type="hidden" name="taskId" value={t.id} />
            <SubmitButton variant="quiet" pendingLabel="Undoing">
              Undo
            </SubmitButton>
          </ActionForm>
        )}
      </div>
      {t.status === "pending" ? (
        <details className="mt-2">
          <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold text-slate underline underline-offset-4">Skip</summary>
          <ActionForm action={skipTask} className="mt-2 space-y-2">
            <input type="hidden" name="taskId" value={t.id} />
            <input type="hidden" name="kind" value={t.kind} />
            <label className="block">
              <span className="mb-1 block font-semibold">{medicine ? "Why was it not given?" : "Why? (optional)"}</span>
              <Textarea name="note" rows={2} maxLength={500} required={medicine} />
            </label>
            <SubmitButton variant="secondary" pendingLabel="Skipping">
              Skip {t.label.toLowerCase()}
            </SubmitButton>
          </ActionForm>
        </details>
      ) : null}
    </li>
  );
}
