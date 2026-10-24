import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonStyles, DoorTag, Empty, Input, Ledger, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { stayText } from "@/lib/bookings";
import { addDays, formatMoney, peaksTouching, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { bookingCards, peakPeriods, toPeak, type BookingCard } from "@/lib/queries";
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

const PAST_PAGE = 100;

async function Bookings({ searchParams }: Pick<PageProps<"/app/bookings">, "searchParams">) {
  const params = await searchParams;
  const past = params.show === "past";
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  // Past bookings a hundred at a time, newest first; page 1 is the newest.
  const page = past && !q && typeof params.page === "string" && /^[1-9][0-9]{0,3}$/.test(params.page) ? Number(params.page) : 1;
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  const list = () =>
    past
      ? bookingCards(supabase, org.id).in("status", ["checked_out", "cancelled", "no_show"]).order("end_date", { ascending: false }).order("id")
      : bookingCards(supabase, org.id).in("status", ["requested", "confirmed", "checked_in"]).order("start_date").order("id");
  // % and _ are wildcards in a LIKE pattern; strip them so a search is always literal.
  const literal = q.replace(/[%_\\,()]/g, "");
  let data: BookingCard[];
  let more = false;
  if (!literal) {
    // One more than a page, to know whether there are older ones.
    const res = past ? await list().range((page - 1) * PAST_PAGE, page * PAST_PAGE) : await list().limit(300);
    if (res.error) throw new Error("Could not load bookings.");
    more = past && res.data.length > PAST_PAGE;
    data = res.data.slice(0, past ? PAST_PAGE : 300);
  } else {
    // The pet's name, or its parent's name or phone number (typed any way: 98765 43210, +91...), as on Pets.
    const digits = q.replace(/\D/g, "");
    const parentFilter = [`full_name.ilike.%${literal}%`, ...(digits.length >= 4 ? [`phone.ilike.%${digits}%`, `alt_phone.ilike.%${digits}%`] : [])].join(",");
    const [pets, parents] = await Promise.all([
      supabase.from("pets").select("id").eq("org_id", org.id).ilike("name", `%${literal}%`).limit(200),
      supabase.from("clients").select("id").eq("org_id", org.id).or(parentFilter).limit(200),
    ]);
    if (pets.error || parents.error) throw new Error("Could not load bookings.");
    const [byPet, byParent] = await Promise.all([
      pets.data.length > 0 ? list().in("pet_id", pets.data.map((x) => x.id)).limit(PAST_PAGE) : Promise.resolve({ data: [], error: null }),
      parents.data.length > 0 ? list().in("client_id", parents.data.map((x) => x.id)).limit(PAST_PAGE) : Promise.resolve({ data: [], error: null }),
    ]);
    if (byPet.error || byParent.error) throw new Error("Could not load bookings.");
    const seen = new Set<string>();
    data = [...byPet.data, ...byParent.data]
      .filter((b) => (seen.has(b.id) ? false : (seen.add(b.id), true)))
      .sort((a, b) => (past ? b.end_date.localeCompare(a.end_date) : a.start_date.localeCompare(b.start_date)))
      .slice(0, PAST_PAGE);
  }
  const peaks = past ? { data: [], error: null } : await peakPeriods(supabase, org.id, today, addDays(today, 400));
  if (peaks.error) throw new Error("Could not load bookings.");
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
        <Link href={q ? `/app/bookings?q=${encodeURIComponent(q)}` : "/app/bookings"} className={tab(!past)} aria-current={!past ? "page" : undefined}>
          {m.bookings.current}
        </Link>
        <Link href={`/app/bookings?show=past${q ? `&q=${encodeURIComponent(q)}` : ""}`} className={tab(past)} aria-current={past ? "page" : undefined}>
          {m.bookings.past}
        </Link>
      </div>
      <form className="mb-4 flex gap-2" role="search">
        {past ? <input type="hidden" name="show" value="past" /> : null}
        <label className="flex-1">
          <span className="sr-only">{m.bookings.searchLabel}</span>
          <Input name="q" type="search" defaultValue={q} placeholder={m.bookings.searchPlaceholder} />
        </label>
        <button type="submit" className={buttonStyles.secondary}>
          {m.bookings.search}
        </button>
      </form>

      {data.length === 0 ? (
        <Empty>{q ? fill(m.bookings.nothingFound, { q }) : past ? m.bookings.noPast : m.bookings.none}</Empty>
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
      {page > 1 || more ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {page > 1 ? (
            <Link href={page === 2 ? "/app/bookings?show=past" : `/app/bookings?show=past&page=${page - 1}`} className={buttonStyles.secondary}>
              {m.bookings.newer}
            </Link>
          ) : null}
          {more ? (
            <Link href={`/app/bookings?show=past&page=${page + 1}`} className={buttonStyles.secondary}>
              {m.bookings.older}
            </Link>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
