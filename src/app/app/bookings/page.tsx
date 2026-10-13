import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonStyles, DoorTag, Empty, Ledger, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { STATUS_LABEL, stayText } from "@/lib/bookings";
import { addDays, formatMoney, peaksTouching, todayIn } from "@/lib/core";
import { bookingCards, peakPeriods, toPeak } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Bookings" };

export default function BookingsPage({ searchParams }: PageProps<"/app/bookings">) {
  return (
    <>
      <PageTitle title="Bookings">
        <Link href="/app/calendar" className={buttonStyles.secondary}>
          Calendar
        </Link>
        <Link href="/app/bookings/new" className={buttonStyles.primary}>
          New booking
        </Link>
      </PageTitle>
      <Suspense fallback={<Loading label="Loading bookings" />}>
        <Bookings searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Bookings({ searchParams }: Pick<PageProps<"/app/bookings">, "searchParams">) {
  const past = (await searchParams).show === "past";
  const { org } = await requireOrg();
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  const query = past
    ? bookingCards(supabase, org.id).in("status", ["checked_out", "cancelled", "no_show"]).order("end_date", { ascending: false }).limit(100)
    : bookingCards(supabase, org.id).in("status", ["requested", "confirmed", "checked_in"]).order("start_date").limit(300);
  const [{ data, error }, peaks] = await Promise.all([query, past ? Promise.resolve({ data: [], error: null }) : peakPeriods(supabase, org.id, today, addDays(today, 400))]);
  if (error || peaks.error) throw new Error("Could not load bookings.");
  const periods = (peaks.data ?? []).map(toPeak);

  const tab = (active: boolean) =>
    `inline-flex min-h-12 items-center rounded-lg px-4 font-semibold ${active ? "bg-ink text-paper" : "bg-paper text-ink border border-rule"}`;

  return (
    <>
      <div className="mb-4 flex gap-2">
        <Link href="/app/bookings" className={tab(!past)} aria-current={!past ? "page" : undefined}>
          Current and upcoming
        </Link>
        <Link href="/app/bookings?show=past" className={tab(past)} aria-current={past ? "page" : undefined}>
          Past
        </Link>
      </div>

      {data.length === 0 ? (
        <Empty>{past ? "No past bookings yet." : "No bookings yet. Add the first one with New booking."}</Empty>
      ) : (
        <Ledger>
          {data.map((b) => {
            const touching = peaksTouching({ kind: b.kind, startDate: b.start_date, endDate: b.end_date }, periods);
            return (
              <li key={b.id}>
                <Link href={`/app/bookings/${b.id}`} className="block px-4 py-3 hover:bg-ground">
                  <p className="flex flex-wrap items-center gap-2">
                    <DoorTag name={b.kennels?.name} />
                    <span className="text-lg font-bold">{b.pets?.name ?? "Unknown pet"}</span>
                    <Badge
                      tone={
                        b.status === "checked_in" ? "good" : b.status === "requested" || (b.status === "confirmed" && b.start_date <= today) ? "attention" : "neutral"
                      }
                    >
                      {STATUS_LABEL[b.status]}
                    </Badge>
                    {b.kind === "daycare" ? <Badge>Day boarding</Badge> : null}
                    {b.group_id ? <Badge>Family</Badge> : null}
                    {touching.map((p) => (
                      <Badge key={p.name} tone="attention">
                        {p.name}
                      </Badge>
                    ))}
                  </p>
                  <p className="mt-1 text-slate">
                    {b.clients?.full_name}. {stayText(b.kind, b.start_date, b.end_date)} at{" "}
                    {formatMoney(b.rate_minor, { currency: org.currency, locale: org.locale, trimZeros: true })}.
                  </p>
                </Link>
              </li>
            );
          })}
        </Ledger>
      )}
    </>
  );
}
