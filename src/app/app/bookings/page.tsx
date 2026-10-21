import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonStyles, DoorTag, Empty, Ledger, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { stayText } from "@/lib/bookings";
import { addDays, formatMoney, peaksTouching, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { bookingCards, peakPeriods, toPeak } from "@/lib/queries";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { PetAvatar } from "@/components/pet-avatar";

export const generateMetadata = () => appTitle((m) => m.bookings.title);

export default function BookingsPage({ searchParams }: PageProps<"/app/bookings">) {
  return (
    <Suspense fallback={<Loading />}>
      <Bookings searchParams={searchParams} />
    </Suspense>
  );
}

async function Bookings({ searchParams }: Pick<PageProps<"/app/bookings">, "searchParams">) {
  const past = (await searchParams).show === "past";
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  const query = past
    ? bookingCards(supabase, org.id).in("status", ["checked_out", "cancelled", "no_show"]).order("end_date", { ascending: false }).limit(100)
    : bookingCards(supabase, org.id).in("status", ["requested", "confirmed", "checked_in"]).order("start_date").limit(300);
  const [{ data, error }, peaks] = await Promise.all([query, past ? Promise.resolve({ data: [], error: null }) : peakPeriods(supabase, org.id, today, addDays(today, 400))]);
  if (error || peaks.error) throw new Error("Could not load bookings.");
  const periods = (peaks.data ?? []).map(toPeak);
  const photos = await signedUrls(supabase, data.map((b) => b.pets?.photo_path), { small: true });

  const tab = (active: boolean) =>
    `inline-flex min-h-12 items-center rounded-lg px-4 font-semibold ${active ? "bg-ink text-paper" : "bg-paper text-ink border border-rule"}`;

  return (
    <>
      <PageTitle title={m.bookings.title}>
        <Link href="/app/calendar" className={buttonStyles.secondary}>
          {m.bookings.calendar}
        </Link>
        <Link href="/app/bookings/new" className={buttonStyles.primary}>
          {m.bookings.newBooking}
        </Link>
      </PageTitle>
      <div className="mb-4 flex gap-2">
        <Link href="/app/bookings" className={tab(!past)} aria-current={!past ? "page" : undefined}>
          {m.bookings.current}
        </Link>
        <Link href="/app/bookings?show=past" className={tab(past)} aria-current={past ? "page" : undefined}>
          {m.bookings.past}
        </Link>
      </div>

      {data.length === 0 ? (
        <Empty>{past ? m.bookings.noPast : m.bookings.none}</Empty>
      ) : (
        <Ledger>
          {data.map((b) => {
            const touching = peaksTouching({ kind: b.kind, startDate: b.start_date, endDate: b.end_date }, periods);
            return (
              <li key={b.id}>
                <Link href={`/app/bookings/${b.id}`} className="flex gap-3 px-4 py-3 hover:bg-ground">
                  <PetAvatar name={b.pets?.name ?? "?"} url={b.pets?.photo_path ? photos.get(b.pets.photo_path) : null} />
                  <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <DoorTag name={b.kennels?.name} empty={m.common.noKennel} />
                    <span className="text-lg font-bold">{b.pets?.name ?? m.bookings.unknownPet}</span>
                    <Badge
                      tone={
                        b.status === "checked_in" ? "good" : b.status === "requested" || (b.status === "confirmed" && b.start_date <= today) ? "attention" : "neutral"
                      }
                    >
                      {m.labels.bookingStatus[b.status]}
                    </Badge>
                    {b.kind === "daycare" ? <Badge>{m.labels.bookingKind.daycare}</Badge> : null}
                    {b.group_id ? <Badge>{m.bookings.family}</Badge> : null}
                    {b.waitlisted_at ? <Badge tone="attention">{m.booking.waitlist.badge}</Badge> : null}
                    {touching.map((p) => (
                      <Badge key={p.name} tone="attention">
                        {p.name}
                      </Badge>
                    ))}
                  </p>
                  <p className="mt-1 text-slate">
                    {fill(m.bookings.summary, {
                      parent: b.clients?.full_name ?? "",
                      stay: stayText(t, b.kind, b.start_date, b.end_date),
                      price: formatMoney(b.rate_minor, { currency: org.currency, locale, trimZeros: true }),
                    })}
                  </p>
                  </div>
                </Link>
              </li>
            );
          })}
        </Ledger>
      )}
    </>
  );
}
