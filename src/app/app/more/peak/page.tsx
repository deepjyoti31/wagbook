import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, todayIn } from "@/lib/core";
import { createClient } from "@/lib/supabase/server";
import { addPeakPeriod, removePeakPeriod } from "./actions";

export const metadata: Metadata = { title: "Peak periods" };

export default function PeakPage() {
  return (
    <>
      <PageTitle title="Peak periods" />
      <Suspense fallback={<Loading label="Loading peak periods" />}>
        <Peaks />
      </Suspense>
    </>
  );
}

async function Peaks() {
  const { org, canManage } = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("peak_periods")
    .select("id, name, start_date, end_date, no_refund, play_session_minutes")
    .eq("org_id", org.id)
    .gte("end_date", todayIn(org.time_zone))
    .order("start_date");
  if (error) throw new Error("Could not load peak periods.");

  return (
    <>
      <p className="mb-5 text-slate">
        Busy stretches like festivals and long weekends. Bookings that touch one are marked. Wagbook never changes prices for them; it can warn you about
        your no-refund rule and shorten play sessions.
      </p>
      {canManage ? null : <Notice tone="info">Only an owner or manager can change peak periods.</Notice>}

      <Section title="Coming up" count={data.length}>
        {data.length === 0 ? (
          <Empty>No peak periods coming up.</Empty>
        ) : (
          <Ledger>
            {data.map((p) => (
              <LedgerRow key={p.id}>
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{p.name}</span>
                    {p.no_refund ? <Badge tone="attention">No refund</Badge> : null}
                    {p.play_session_minutes ? <Badge>Play {p.play_session_minutes} minutes</Badge> : null}
                  </span>
                  <span className="block text-slate">
                    {formatDate(p.start_date)}
                    {p.end_date === p.start_date ? "" : ` to ${formatDate(p.end_date)}`}
                  </span>
                </span>
                {canManage ? (
                  <ActionForm action={removePeakPeriod} className="contents">
                    <input type="hidden" name="periodId" value={p.id} />
                    <SubmitButton variant="quiet" pendingLabel="Removing">
                      Remove
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      {canManage ? (
        <Section title="Add a peak period">
          <ActionForm action={addPeakPeriod} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <Field label="Name">
              <Input name="name" required maxLength={80} placeholder="Diwali week" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First day">
                <Input name="startDate" type="date" required />
              </Field>
              <Field label="Last day">
                <Input name="endDate" type="date" required />
              </Field>
            </div>
            <label className="flex min-h-12 items-center gap-3">
              <input type="checkbox" name="noRefund" className="size-5" />
              <span>No refund if a booking in this period is cancelled</span>
            </label>
            <Field label="Play session length, minutes" hint="Leave empty to keep your usual length.">
              <Input name="playMinutes" type="number" min={5} max={240} />
            </Field>
            <SubmitButton>Add peak period</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
