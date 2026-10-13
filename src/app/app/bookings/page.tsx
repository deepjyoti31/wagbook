import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Empty, Ledger, LedgerRow, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatMoney, nightsBetween, todayIn } from "@/lib/core";
import { bookingCards } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { cancelBooking } from "./actions";

export const metadata: Metadata = { title: "Bookings" };

const STATUS_LABEL = {
  requested: "Requested",
  confirmed: "Confirmed",
  checked_in: "In house",
  checked_out: "Checked out",
  cancelled: "Cancelled",
  no_show: "Did not arrive",
} as const;

export default function BookingsPage({ searchParams }: PageProps<"/app/bookings">) {
  return (
    <>
      <PageTitle title="Bookings">
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
  const { data, error } = await query;
  if (error) throw new Error("Could not load bookings.");

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
            const nights = nightsBetween(b.start_date, b.end_date);
            const units = b.kind === "boarding" ? nights : nights + 1;
            return (
              <LedgerRow key={b.id}>
                <div className="min-w-0 flex-1 basis-64">
                  <p className="flex flex-wrap items-center gap-2">
                    <DoorTag name={b.kennels?.name} />
                    <span className="text-lg font-bold">{b.pets?.name ?? "Unknown pet"}</span>
                    <Badge tone={b.status === "checked_in" ? "good" : b.status === "confirmed" && b.start_date <= today ? "attention" : "neutral"}>
                      {STATUS_LABEL[b.status]}
                    </Badge>
                    {b.kind === "daycare" ? <Badge>Day boarding</Badge> : null}
                  </p>
                  <p className="mt-1 text-slate">
                    {b.clients?.full_name}. {formatDate(b.start_date)}
                    {b.start_date === b.end_date ? "" : ` to ${formatDate(b.end_date)}`}, {units} {b.kind === "boarding" ? (units === 1 ? "night" : "nights") : units === 1 ? "day" : "days"} at{" "}
                    {formatMoney(b.rate_minor, { currency: org.currency, locale: org.locale, trimZeros: true })}.
                  </p>
                </div>
                {b.status === "confirmed" || b.status === "requested" ? (
                  <ActionForm action={cancelBooking} className="contents">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <SubmitButton variant="quiet" pendingLabel="Cancelling">
                      Cancel
                    </SubmitButton>
                  </ActionForm>
                ) : null}
              </LedgerRow>
            );
          })}
        </Ledger>
      )}
    </>
  );
}
