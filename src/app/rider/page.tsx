import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PhotoInput } from "@/components/photo-input";
import { Badge, buttonStyles, Empty, Loading, Notice, PageTitle } from "@/components/ui";
import { signOut } from "@/app/login/actions";
import { requireRider } from "@/lib/auth";
import { formatPhone, whatsappLink } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { i18nFor } from "@/lib/i18n-server";
import { placeLink, routeLink } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import { markStop } from "./actions";

export const metadata: Metadata = { title: "Wagbook" };

interface Stop {
  delivery_id: string;
  name: string;
  phone: string;
  pet: string;
  packs: number;
  quantity: number | null;
  line: string | null;
  area: string | null;
  postal_code: string | null;
  map_url: string | null;
  door_note: string | null;
  note: string | null;
  status: "planned" | "packed" | "out" | "delivered" | "not_home" | "refused" | "cancelled";
}

interface Run {
  run_id: string;
  org_id: string;
  kennel: string;
  slot: "morning" | "afternoon" | "evening";
  stops: Stop[];
}

/**
 * The rider's screen (M31, D45): their own runs for today and nothing else.
 * Name, address, phone, packs and the note for the door; no prices, no
 * medical notes, no other parents. Everything comes from my_runs().
 */
export default function RiderPage({ searchParams }: PageProps<"/rider">) {
  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-12 pt-5">
      <Suspense fallback={<Loading />}>
        <RiderRuns searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const MARKED = ["out", "delivered", "not_home", "refused"] as const;

async function RiderRuns({ searchParams }: Pick<PageProps<"/rider">, "searchParams">) {
  const done = (await searchParams).done;
  const marked = MARKED.find((s) => s === done);
  const { language } = await requireRider();
  const { m } = i18nFor(language);
  const w = m.rider;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("my_runs", {});
  if (error) throw new Error("Could not load your run.");
  const runs = (data ?? []) as unknown as Run[];

  return (
    <>
      <PageTitle title={w.title}>
        <form action={signOut}>
          <button type="submit" className={buttonStyles.quiet}>
            {w.signOut}
          </button>
        </form>
      </PageTitle>
      {marked ? <Notice tone="ok">{fill(w.marked, { status: m.deliveryStatus[marked] })}</Notice> : null}
      {runs.length === 0 ? <Empty>{w.none}</Empty> : null}
      {runs.map((run) => (
        <section key={run.run_id} className="mb-7">
          <h2 className="mb-1 text-lg font-bold">{run.kennel}</h2>
          <p className="mb-3 text-slate">{plural(language, run.stops.length, w.run, { slot: m.slots[run.slot] })}</p>
          <a href={routeLink(run.stops)} target="_blank" rel="noreferrer" className={`${buttonStyles.secondary} mb-3`}>
            {w.route}
          </a>
          <ol className="space-y-3">
            {run.stops.map((s, i) => (
              <li key={s.delivery_id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="flex flex-wrap items-center gap-2 text-lg font-bold">
                  {i + 1}. {s.name}
                  <Badge tone={s.status === "delivered" ? "good" : s.status === "out" ? "attention" : "neutral"}>{m.deliveryStatus[s.status]}</Badge>
                </p>
                <p>{[s.line, s.area, s.postal_code].filter(Boolean).join(", ")}</p>
                <p className="font-semibold">
                  {s.pet}: {s.quantity !== null ? plural(language, s.quantity, w.pieces) : plural(language, s.packs, w.packs)}
                </p>
                {s.door_note ? <p className="text-slate">{fill(w.door, { note: s.door_note })}</p> : null}
                {s.note ? <p className="text-slate">{s.note}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  <a href={placeLink(s)} target="_blank" rel="noreferrer" className={buttonStyles.secondary}>
                    {w.map}
                  </a>
                  <a href={`tel:${s.phone}`} className={buttonStyles.secondary}>
                    {w.call} {formatPhone(s.phone)}
                  </a>
                  <a
                    href={whatsappLink(fill(w.onTheWayMessage, { name: s.name.split(" ")[0], kennel: run.kennel, pet: s.pet }), s.phone)}
                    target="_blank"
                    rel="noreferrer"
                    className={buttonStyles.whatsapp}
                  >
                    {w.tellOnTheWay}
                  </a>
                </div>
                {s.status === "packed" || s.status === "out" ? (
                  <div className="mt-3 space-y-3 border-t border-rule pt-3">
                    {s.status === "packed" ? (
                      <ActionForm action={markStop} className="contents">
                        <input type="hidden" name="deliveryId" value={s.delivery_id} />
                        <input type="hidden" name="orgId" value={run.org_id} />
                        <SubmitButton variant="secondary" name="status" value="out" pendingLabel={m.common.saving}>
                          {w.onTheWay}
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                    <ActionForm action={markStop} className="space-y-2">
                      <input type="hidden" name="deliveryId" value={s.delivery_id} />
                      <input type="hidden" name="orgId" value={run.org_id} />
                      <PhotoInput name="photo" label={w.photo} words={m.photos} />
                      <div className="flex flex-wrap gap-2">
                        <SubmitButton name="status" value="delivered" pendingLabel={m.common.saving}>
                          {w.delivered}
                        </SubmitButton>
                        <SubmitButton variant="secondary" name="status" value="not_home" pendingLabel={m.common.saving}>
                          {w.notHome}
                        </SubmitButton>
                        <SubmitButton variant="quiet" name="status" value="refused" pendingLabel={m.common.saving}>
                          {w.refused}
                        </SubmitButton>
                      </div>
                    </ActionForm>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ))}
    </>
  );
}
