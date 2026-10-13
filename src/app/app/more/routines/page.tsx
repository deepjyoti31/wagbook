import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { RoutineForm } from "@/components/routine-form";
import { Badge, Empty, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { addStarterRoutines, stopRoutine } from "@/app/app/care/actions";
import { requireOrg } from "@/lib/auth";
import { CARE_KIND_LABEL, clockText, STARTER_ROUTINES } from "@/lib/care";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Daily routines" };

export default function RoutinesPage() {
  return (
    <>
      <PageTitle title="Daily routines" />
      <Suspense fallback={<Loading label="Loading routines" />}>
        <Routines />
      </Suspense>
    </>
  );
}

async function Routines() {
  const { org, canManage } = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("care_items")
    .select("id, kind, label, details, due_time")
    .eq("org_id", org.id)
    .is("pet_id", null)
    .eq("is_active", true)
    .order("due_time")
    .order("sort_order");
  if (error) throw new Error("Could not load routines.");

  return (
    <>
      <p className="mb-5 text-slate">
        House routines happen every day for every pet in house. Each one becomes a task on the Care screen. A pet&apos;s own medicines and meals are added from
        its booking.
      </p>
      {canManage ? null : <Notice tone="info">Only an owner or manager can change the house routines.</Notice>}

      <Section title="Every day" count={data.length}>
        {data.length === 0 ? (
          <>
            <Empty>No house routines yet, so the Care screen is empty.</Empty>
            {canManage ? (
              <ActionForm action={addStarterRoutines} className="mt-4 space-y-3">
                <p>
                  Start with {STARTER_ROUTINES.map((r) => `${r.label.toLowerCase()} at ${r.due_time}`).join(", ")}. You can change them afterwards.
                </p>
                <SubmitButton pendingLabel="Adding">Add the starter routines</SubmitButton>
              </ActionForm>
            ) : null}
          </>
        ) : (
          <Ledger>
            {data.map((r) => (
              <LedgerRow key={r.id}>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{clockText(r.due_time)}</span> {r.label} <Badge tone={r.kind === "medication" ? "alert" : "neutral"}>{CARE_KIND_LABEL[r.kind]}</Badge>
                  {r.details ? <span className="block text-slate">{r.details}</span> : null}
                </span>
                {canManage ? (
                  <ActionForm action={stopRoutine} className="contents">
                    <input type="hidden" name="routineId" value={r.id} />
                    <SubmitButton variant="quiet" pendingLabel="Stopping">
                      Stop
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
