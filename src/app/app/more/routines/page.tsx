import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RoutineForm } from "@/components/routine-form";
import { Badge, Empty, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { addStarterRoutines, stopRoutine } from "@/app/app/care/actions";
import { requireOrg } from "@/lib/auth";
import { clockText, starterRoutines } from "@/lib/care";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.routines.title);

export default function RoutinesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Routines />
    </Suspense>
  );
}

async function Routines() {
  const { org, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  const r = m.routines;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("care_items")
    .select("id, kind, label, details, due_time, needs_photo")
    .eq("org_id", org.id)
    .is("pet_id", null)
    .eq("is_active", true)
    .order("due_time")
    .order("sort_order");
  if (error) throw new Error("Could not load routines.");

  const starters = starterRoutines(m)
    .map((s) => fill(r.starterItem, { label: s.label.toLowerCase(), time: s.due_time }))
    .join(r.listJoin);

  return (
    <>
      <PageTitle title={r.title} />
      <p className="mb-5 text-slate">{r.intro}</p>
      {canManage ? null : <Notice tone="info">{r.onlyManagers}</Notice>}

      <Section title={r.everyDay} count={data.length}>
        {data.length === 0 ? (
          <>
            <Empty>{r.none}</Empty>
            {canManage ? (
              <ActionForm action={addStarterRoutines} className="mt-4 space-y-3">
                <p>{fill(r.startWith, { list: starters })}</p>
                <SubmitButton pendingLabel={m.common.adding}>{r.addStarter}</SubmitButton>
              </ActionForm>
            ) : null}
          </>
        ) : (
          <Ledger>
            {data.map((item) => (
              <LedgerRow key={item.id}>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{clockText(m, item.due_time)}</span> {item.label}{" "}
                  <Badge tone={item.kind === "medication" ? "alert" : "neutral"}>{m.labels.careKind[item.kind]}</Badge>
                  {item.needs_photo ? <> <Badge>{m.proof.needsPhoto}</Badge></> : null}
                  {item.details ? <span className="block text-slate">{item.details}</span> : null}
                </span>
                {canManage ? (
                  <ActionForm action={stopRoutine} className="contents">
                    <input type="hidden" name="routineId" value={item.id} />
                    <SubmitButton variant="quiet" pendingLabel={r.stopping}>
                      {r.stop}
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      {canManage ? <RoutineForm /> : null}
    </>
  );
}
