import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, isISODate, todayIn } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { placeLink, routeLink } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import { arrangeStop, startRun } from "./actions";

export const generateMetadata = () => appTitle((m) => m.runs.title);

export default function RunsPage({ searchParams }: PageProps<"/app/food/runs">) {
  return (
    <Suspense fallback={<Loading />}>
      <Runs searchParams={searchParams} />
    </Suspense>
  );
}

async function Runs({ searchParams }: Pick<PageProps<"/app/food/runs">, "searchParams">) {
  const { date: asked, done } = await searchParams;
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale, language } = t;
  const r = m.runs;
  const day = typeof asked === "string" && isISODate(asked) ? asked : todayIn(org.time_zone);
  const supabase = await createClient();
  const [runs, deliveries, members] = await Promise.all([
    supabase.from("delivery_runs").select("id, slot, rider_id").eq("org_id", org.id).eq("run_date", day).order("slot"),
    supabase
      .from("deliveries")
      .select("id, slot, status, packs, run_id, run_position, created_at, pets(name), clients(full_name), client_addresses(line, area, postal_code, map_url)")
      .eq("org_id", org.id)
      .eq("delivery_date", day)
      .neq("status", "cancelled")
      .not("address_id", "is", null)
      .order("run_position", { nullsFirst: false })
      .order("created_at"),
    supabase.from("memberships").select("user_id, display_name, role, skills").eq("org_id", org.id).eq("is_active", true).order("display_name"),
  ]);
  if (runs.error || deliveries.error || members.error) throw new Error("Could not load runs.");
  const riders = members.data.filter((x) => x.role === "rider" || x.skills.includes("rider"));
  const nameOf = new Map(members.data.map((x) => [x.user_id, x.display_name]));
  const unassigned = deliveries.data.filter((d) => !d.run_id);

  return (
    <>
      <PageTitle title={r.title}>
        <Link href="/app/food" className={buttonStyles.quiet}>
          {m.food.title}
        </Link>
      </PageTitle>
      {done === "added" ? <Notice tone="ok">{r.added}</Notice> : null}
      <p className="mb-4 text-slate">{r.about}</p>
      {org.offers_food_delivery ? null : <Notice tone="info">{m.food.off}</Notice>}
      <form className="mb-6 flex flex-wrap items-end gap-2" action="/app/food/runs">
        <div className="min-w-48 flex-1">
          <Field label={r.day}>
            <Input type="date" name="date" defaultValue={day} required />
          </Field>
        </div>
        <button type="submit" className={buttonStyles.secondary}>
          {m.kitchen.show}
        </button>
      </form>

      {runs.data.map((run) => {
        const stops = deliveries.data.filter((d) => d.run_id === run.id);
        return (
          <Section key={run.id} title={fill(r.run, { rider: nameOf.get(run.rider_id) ?? "", slot: m.slots[run.slot] })} count={stops.length}>
            {stops.length === 0 ? (
              <Empty>{r.noStops}</Empty>
            ) : (
              <>
                <Ledger>
                  {stops.map((d, i) => (
                    <LedgerRow key={d.id}>
                      <div className="min-w-48 flex-1">
                        <p className="font-semibold">{plural(language, d.packs, r.stop, { n: i + 1, count: d.packs, pet: d.pets?.name ?? "", parent: d.clients?.full_name ?? "" })}</p>
                        <p className="text-sm text-slate">{[d.client_addresses?.line, d.client_addresses?.area, d.client_addresses?.postal_code].filter(Boolean).join(", ")}</p>
                      </div>
                      <Badge tone={d.status === "delivered" ? "good" : "neutral"}>{m.deliveryStatus[d.status]}</Badge>
                      {d.client_addresses ? (
                        <a href={placeLink(d.client_addresses)} target="_blank" rel="noreferrer" className={buttonStyles.quiet}>
                          {r.openMap}
                        </a>
                      ) : null}
                      <ActionForm action={arrangeStop} className="flex flex-wrap gap-1">
                        <input type="hidden" name="deliveryId" value={d.id} />
                        <SubmitButton variant="quiet" name="intent" value="up" pendingLabel="…">
                          {r.up}
                        </SubmitButton>
                        <SubmitButton variant="quiet" name="intent" value="down" pendingLabel="…">
                          {r.down}
                        </SubmitButton>
                        <SubmitButton variant="quiet" name="intent" value="off" pendingLabel="…">
                          {r.take}
                        </SubmitButton>
                      </ActionForm>
                    </LedgerRow>
                  ))}
                </Ledger>
                <a
                  href={routeLink(stops.map((d) => d.client_addresses ?? { line: null, area: null, postal_code: null }))}
                  target="_blank"
                  rel="noreferrer"
                  className={`${buttonStyles.secondary} mt-3`}
                >
                  {r.route}
                </a>
              </>
            )}
          </Section>
        );
      })}

      <Section title={r.unassigned} count={unassigned.length}>
        {unassigned.length === 0 ? (
          <Empty>{r.noneUnassigned}</Empty>
        ) : (
          <Ledger>
            {unassigned.map((d) => {
              const fits = runs.data.filter((x) => x.slot === d.slot);
              return (
                <LedgerRow key={d.id}>
                  <div className="min-w-48 flex-1">
                    <p className="font-semibold">
                      {d.pets?.name} ({d.clients?.full_name}), {m.slots[d.slot]}
                    </p>
                    <p className="text-sm text-slate">{[d.client_addresses?.line, d.client_addresses?.area, d.client_addresses?.postal_code].filter(Boolean).join(", ")}</p>
                  </div>
                  {fits.length > 0 ? (
                    <ActionForm action={arrangeStop} className="flex flex-wrap items-end gap-2">
                      <input type="hidden" name="deliveryId" value={d.id} />
                      <input type="hidden" name="intent" value="add" />
                      <Select name="runId" aria-label={r.addTo} className="w-auto" defaultValue={fits[0].id}>
                        {fits.map((x) => (
                          <option key={x.id} value={x.id}>
                            {nameOf.get(x.rider_id)}
                          </option>
                        ))}
                      </Select>
                      <SubmitButton variant="secondary" pendingLabel={r.adding}>
                        {r.addTo}
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </LedgerRow>
              );
            })}
          </Ledger>
        )}
      </Section>

      <Section title={r.newRun}>
        {riders.length === 0 ? (
          <Empty>{r.noRiders}</Empty>
        ) : (
          <ActionForm action={startRun} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
            <input type="hidden" name="date" value={day} />
            <Field label={r.rider}>
              <Select name="riderId" required>
                {riders.map((x) => (
                  <option key={x.user_id} value={x.user_id}>
                    {x.display_name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={r.slot}>
              <Select name="slot" defaultValue="morning">
                {(["morning", "afternoon", "evening"] as const).map((s) => (
                  <option key={s} value={s}>
                    {m.slots[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <SubmitButton pendingLabel={m.common.adding}>{r.startRun}</SubmitButton>
            </div>
            <p className="text-sm text-slate sm:col-span-3">{formatDate(day, locale)}</p>
          </ActionForm>
        )}
      </Section>
    </>
  );
}
