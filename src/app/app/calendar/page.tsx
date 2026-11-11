import Link from "next/link";
import { Fragment, Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Icon } from "@/components/icons";
import { PetAvatar } from "@/components/pet-avatar";
import { Badge, buttonStyles, Empty, Ledger, LedgerRow, Loading, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { shortStayText } from "@/lib/bookings";
import {
  addDays, calendarBars, calendarDays, calendarGrid, formatDay, formatMoney, isISODate, isOverstaying, spaceFreeMessage, todayIn, whatsappLink, type CalendarBar, type ISODate,
} from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n } from "@/lib/i18n-server";
import { bookingCards, type BookingCard } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { confirmRequest } from "../bookings/actions";

export const generateMetadata = () => appTitle((m) => m.calendar.title);

const DAYS = 14;
/** Requests drawn under the kennels; more are on the bookings list. */
const MAX_REQUESTS = 30;

export default function CalendarPage({ searchParams }: PageProps<"/app/calendar">) {
  return (
    <Suspense fallback={<Loading />}>
      <Calendar searchParams={searchParams} />
    </Suspense>
  );
}

function dayLabel(date: ISODate, locale: string) {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" }).format(d),
    number: new Intl.DateTimeFormat(locale, { day: "numeric", timeZone: "UTC" }).format(d),
    day: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(d),
    long: new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", timeZone: "UTC" }).format(d),
    weekend: d.getUTCDay() === 0 || d.getUTCDay() === 6,
  };
}

/** How a bar is drawn, by what the stay is (the colours are the legend's). */
const BAR = {
  in: "border border-[#8fcaa5] bg-leaf-soft text-leaf-ink",
  confirmed: "border border-[#b7c4de] bg-mist text-ink",
  arriving: "border border-marigold bg-marigold-soft text-marigold-ink",
  request: "border-[1.5px] border-dashed border-[#b38200] bg-paper text-marigold-ink",
  clean: "border border-dashed border-[#9aa4b8] bg-ground text-slate",
  overstay: "border border-[#e9a29c] bg-alert-soft text-alert-ink",
} as const;
const BAR_BASE = "z-[1] flex items-center gap-1.5 overflow-hidden whitespace-nowrap rounded-[9px] px-2.5 text-[13.5px] font-[650]";

type Drawn = { id: string; pet: string; parent: string | null; look: keyof typeof BAR; label?: string };

async function Calendar({ searchParams }: Pick<PageProps<"/app/calendar">, "searchParams">) {
  const params = await searchParams;
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const w = m.calendar;
  const today = todayIn(org.time_zone);
  const from = typeof params.from === "string" && isISODate(params.from) ? params.from : today;
  const days = calendarDays(from, DAYS);
  const last = days[days.length - 1];

  const supabase = await createClient();
  const [kennels, stays, occupancy, requests, dirty, waiting] = await Promise.all([
    supabase.from("kennels").select("id, name, is_active").eq("org_id", org.id).order("sort_order").order("name"),
    supabase
      .from("bookings")
      .select("id, kind, status, start_date, end_date, kennel_id, pets(name), clients(full_name)")
      .eq("org_id", org.id)
      .in("status", ["confirmed", "checked_in"])
      .lte("start_date", last)
      // A pet still in house after its check-out date is in its kennel today, so it is read whatever its dates say.
      .or(`end_date.gte.${from},status.eq.checked_in`)
      .limit(5000),
    supabase.rpc("occupancy_by_day", { p_org: org.id, p_from: from, p_to: last }),
    // Requests hold no space. They are drawn with a dashed edge, and listed under the calendar (the waiting list in its order).
    bookingCards(supabase, org.id).eq("status", "requested").gte("end_date", today).order("waitlisted_at", { nullsFirst: false }).order("start_date").limit(MAX_REQUESTS + 1),
    // Kennels a pet has left, still to clean (M50).
    supabase.from("kennel_cleans").select("kennel_id").eq("org_id", org.id).is("cleaned_at", null),
    supabase.rpc("waiting_list", { p_org: org.id }),
  ]);
  if (kennels.error || stays.error || occupancy.error || requests.error) throw new Error("Could not load the calendar.");
  const asked = requests.data.slice(0, MAX_REQUESTS);

  const held = new Set(stays.data.map((s) => s.kennel_id));
  const toClean = new Set((dirty.data ?? []).map((c) => c.kennel_id));
  // Kennels out of service are shown only while a stay still sits in one.
  const rows = kennels.data.filter((k) => k.is_active || held.has(k.id));
  const grid = calendarGrid(
    rows.map((k) => k.id),
    [
      ...stays.data.map((s) => {
        const overstay = isOverstaying({ status: s.status, endDate: s.end_date }, today);
        const late = s.status === "confirmed" && s.start_date < today;
        const pet = s.pets?.name ?? w.pet;
        return {
          id: s.id,
          kind: s.kind,
          status: s.status,
          startDate: s.start_date,
          // A pet still here after its check-out date is in its kennel today, even though the booking no longer holds it.
          endDate: s.status === "checked_in" && s.end_date <= today ? (s.kind === "daycare" ? today : addDays(today, 1)) : s.end_date,
          kennelId: s.kennel_id,
          pet,
          parent: s.clients?.full_name ?? null,
          look: (overstay ? "overstay" : s.status === "checked_in" ? "in" : s.start_date <= today ? "arriving" : "confirmed") as keyof typeof BAR,
          label: late ? fill(w.wasDue, { pet, date: formatDay(s.start_date, locale) }) : undefined,
        };
      }),
      ...asked.map((r) => {
        const pet = r.pets?.name ?? w.pet;
        return {
          id: r.id,
          kind: r.kind,
          status: r.status,
          startDate: r.start_date,
          endDate: r.end_date,
          kennelId: r.kennel_id,
          pet,
          parent: r.clients?.full_name ?? null,
          look: "request" as keyof typeof BAR,
          label: fill(w.asked, { pet }),
        };
      }),
    ],
    days,
  );
  const labels = days.map((d) => dayLabel(d, locale));
  const todayAt = days.indexOf(today);
  const first = labels[0];
  const end = labels[labels.length - 1];
  const title = fill(m.stay.dates, { start: from.slice(0, 7) === last.slice(0, 7) ? first.number : first.long, end: end.long });
  const step = (date: ISODate) => (date === today ? "/app/calendar" : `/app/calendar?from=${date}`);

  // Each kennel is a row of the grid, 50 pixels high for each lane of bars; stays with no kennel yet come last.
  const kennelRows = rows.map((k) => ({ kennel: k, bars: calendarBars<Drawn>(grid.byKennel.get(k.id)!) }));
  const loose = calendarBars<Drawn>(grid.unassigned);
  const rowHeights = [...kennelRows.map((r) => (r.bars[0]?.lanes ?? 1) > 2 ? 25 * r.bars[0].lanes : 50), ...(loose.length > 0 ? [Math.max(50, 44 * loose[0].lanes + 6)] : [])];
  const lastRow = rowHeights.length + 2;
  const bar = (b: CalendarBar<Drawn>, row: number, key: string) => {
    const tall = b.lanes === 1;
    return (
      <Link
        key={key}
        href={`/app/bookings/${b.stay.id}`}
        title={b.stay.parent ? `${b.stay.pet} · ${b.stay.parent}` : b.stay.pet}
        className={`${BAR_BASE} ${BAR[b.stay.look]}`}
        style={{
          gridRow: row,
          gridColumn: `${b.from + 2} / ${b.to + 3}`,
          margin: tall ? "7px 3px" : "3px 3px",
          ...(tall ? {} : { alignSelf: "start", height: `calc(${100 / b.lanes}% - 6px)`, marginTop: `calc(${(100 / b.lanes) * b.lane}% + 3px)` }),
        }}
      >
        {b.stay.label ?? b.stay.pet}
        {b.stay.parent && b.to > b.from ? <span className="font-medium">· {b.stay.parent}</span> : null}
      </Link>
    );
  };

  // The requests under the calendar: those still to answer, with a kennel that is free for them, and the waiting list.
  const toAnswer = asked.filter((r) => !r.waitlisted_at);
  const waitlisted = asked.filter((r) => r.waitlisted_at);
  const freeFor = await Promise.all(
    toAnswer.slice(0, 12).map(async (r) => {
      const { data } = await supabase.rpc("available_kennels", { p_org: org.id, p_kind: r.kind, p_start: r.start_date, p_end: r.end_date, p_client: r.clients?.id });
      return [r.id, (data ?? []).find((k) => k.id === r.kennel_id)?.name ?? data?.[0]?.name ?? null] as const;
    }),
  );
  const freeKennel = new Map(freeFor);
  const hasSpace = new Map((waiting.data ?? []).map((x) => [x.booking_id, x.has_space]));
  const parentWords = parentI18n(org.parent_language, org.locale);
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const who = (r: BookingCard, price: boolean) =>
    [r.clients?.full_name, shortStayText(t, r.kind, r.start_date, r.end_date, today), price && r.rate_minor ? fill(r.kind === "boarding" ? w.answer.aNight : w.answer.aDay, { price: money(r.rate_minor) }) : null]
      .filter(Boolean)
      .join(" · ");

  return (
    <>
      <PageTitle eyebrow={m.nav.bookings} title={title}>
        <nav aria-label={w.view} className="inline-flex gap-1 rounded-xl bg-track p-1">
          <Link href="/app/bookings" className="inline-flex min-h-10 items-center rounded-[9px] px-4 text-[14.5px] font-[650] text-steel">
            {w.list}
          </Link>
          <Link href="/app/calendar" aria-current="page" className="inline-flex min-h-10 items-center rounded-[9px] bg-paper px-4 text-[14.5px] font-[650] text-ink shadow-[0_1px_2px_rgba(20,33,61,0.12)]">
            {w.title}
          </Link>
        </nav>
        <Link href="/app/bookings/new" className={buttonStyles.primary}>
          <Icon name="plus" />
          {w.newBooking}
        </Link>
      </PageTitle>

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <div className="flex gap-1.5">
          <Link href={step(addDays(from, -DAYS))} aria-label={w.earlier} className={`${buttonStyles.secondary} px-3!`}>
            <Icon name="back" />
          </Link>
          <Link href="/app/calendar" className={buttonStyles.secondary}>
            {w.thisWeek}
          </Link>
          <Link href={step(addDays(from, DAYS))} aria-label={w.later} className={`${buttonStyles.secondary} px-3!`}>
            <Icon name="forward" />
          </Link>
        </div>
        <span className="flex-1" />
        <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-[13.5px] font-semibold text-steel">
          {(["in", "arriving", "confirmed", "request", "clean", "overstay"] as const).map((look) => (
            <li key={look} className="inline-flex items-center gap-1.5">
              <span className={`inline-block h-3.5 w-[22px] rounded-[9px] ${BAR[look]}`} />
              {w.legend[look === "in" ? "inHouse" : look]}
            </li>
          ))}
        </ul>
      </div>

      {requests.data.length > MAX_REQUESTS ? (
        <p className="mb-4 rounded-[14px] bg-marigold-soft px-4 py-3">
          {fill(w.moreRequests, { n: MAX_REQUESTS })}{" "}
          <Link href="/app/bookings" className="font-semibold underline underline-offset-4">
            {w.seeBookings}
          </Link>
        </p>
      ) : null}
      {rows.length === 0 ? (
        <Empty>
          {w.noKennels}{" "}
          <Link href="/app/more/kennels" className="font-semibold text-ink underline underline-offset-4">
            {w.addKennels}
          </Link>
        </Empty>
      ) : (
        <div className="mb-5 overflow-x-auto rounded-2xl border border-rule bg-paper" role="region" aria-label={w.region} tabIndex={0}>
          <div
            className="relative grid min-w-[960px]"
            style={{ gridTemplateColumns: `112px repeat(${DAYS}, minmax(58px, 1fr))`, gridTemplateRows: `64px ${rowHeights.map((h) => `${h}px`).join(" ")}` }}
          >
            {/* The columns behind everything: today in marigold, the weekend a shade darker. */}
            {days.map((d, i) => (
              <div
                key={d}
                aria-hidden="true"
                className={i === todayAt ? "border-l-2 border-marigold bg-[#fff8e6]" : `border-l border-rule-soft ${labels[i].weekend ? "bg-[#f8f9fb]" : ""}`}
                style={{ gridColumn: i + 2, gridRow: `1 / ${lastRow}` }}
              />
            ))}

            <div className="sticky left-0 z-[2] flex items-end border-b border-rule bg-paper px-3.5 pb-2.5 text-[13px] font-[650] text-slate" style={{ gridColumn: 1, gridRow: 1 }}>
              {w.kennel}
            </div>
            {days.map((d, i) => {
              const o = (occupancy.data ?? []).find((x) => x.day === d);
              const free = o ? o.capacity - o.occupied : null;
              return (
                <div key={d} className="flex flex-col items-center justify-center border-b border-rule text-[13px] text-slate" style={{ gridColumn: i + 2, gridRow: 1 }}>
                  {i === todayAt ? <span className="font-bold text-marigold-ink">{w.todayShort}</span> : <span>{labels[i].weekday}</span>}
                  <b className="text-[15px] text-ink">{i === todayAt ? `${labels[i].weekday} ${labels[i].number}` : labels[i].number}</b>
                  {free === null ? null : free > 0 ? (
                    <span className="text-xs font-[650] text-leaf">{fill(w.free, { n: free })}</span>
                  ) : (
                    <span className="text-xs font-[650] text-alert-ink">{w.full}</span>
                  )}
                </div>
              );
            })}

            {kennelRows.map(({ kennel: k, bars }, r) => (
              <Fragment key={k.id}>
                <div className="sticky left-0 z-[2] flex items-center border-t border-rule-soft bg-paper pl-3.5" style={{ gridColumn: 1, gridRow: r + 2 }}>
                  <span className="door-tag">{k.name}</span>
                </div>
                {/* An empty square books that kennel from that day. */}
                {k.is_active
                  ? days.map((day, i) =>
                      day >= today && grid.byKennel.get(k.id)![i].length === 0 && !(i === todayAt && toClean.has(k.id)) ? (
                        <Link
                          key={day}
                          href={`/app/bookings/new?kennel=${k.id}&start=${day}`}
                          className="flex items-center justify-center text-transparent hover:bg-marigold-soft hover:text-ink focus-visible:text-ink"
                          style={{ gridColumn: i + 2, gridRow: r + 2 }}
                        >
                          <span aria-hidden="true">+</span>
                          <span className="sr-only">{fill(w.bookFrom, { kennel: k.name, day: labels[i].day })}</span>
                        </Link>
                      ) : null,
                    )
                  : null}
                {k.is_active && toClean.has(k.id) && todayAt >= 0 && grid.byKennel.get(k.id)![todayAt].length === 0 ? (
                  <Link href="/app" className={`${BAR_BASE} ${BAR.clean}`} style={{ gridRow: r + 2, gridColumn: todayAt + 2, margin: "7px 3px" }}>
                    {w.clean}
                  </Link>
                ) : null}
                {bars.map((b) => bar(b, r + 2, `${b.stay.id}-${b.from}`))}
              </Fragment>
            ))}

            {loose.length > 0 ? (
              <>
                <div
                  className="sticky left-0 z-[2] flex items-center border-t border-rule-soft bg-[#fffaf0] pl-3.5 pr-2 text-[13px] font-[650] leading-tight text-marigold-ink"
                  style={{ gridColumn: 1, gridRow: kennelRows.length + 2 }}
                >
                  {w.noKennelYet}
                </div>
                {loose.map((b) => bar(b, kennelRows.length + 2, `loose-${b.stay.id}-${b.from}`))}
              </>
            ) : null}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-x-5 min-[1100px]:grid-cols-2">
        {toAnswer.length > 0 ? (
          <Section title={w.answer.title} count={toAnswer.length}>
            <p className="mb-3 text-sm text-slate">{w.answer.about}</p>
            <Ledger>
              {toAnswer.map((r) => (
                <LedgerRow key={r.id}>
                  <PetAvatar name={r.pets?.name ?? "?"} />
                  <div className="min-w-0 flex-[1_1_200px]">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/app/bookings/${r.id}`} className="text-[16.5px] font-bold underline-offset-4 hover:underline">
                        {r.pets?.name ?? w.pet}
                      </Link>
                      {r.pets?.breed ? <span className="text-sm text-slate">{r.pets.breed}</span> : null}
                      {freeKennel.has(r.id) ? (
                        freeKennel.get(r.id) ? <Badge tone="good">{fill(w.answer.kennelFree, { kennel: freeKennel.get(r.id) ?? "" })}</Badge> : <Badge tone="alert">{w.answer.noSpace}</Badge>
                      ) : null}
                    </p>
                    <p className="text-sm text-slate">{who(r, true)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {/* Declining asks for a reason, on the booking's own page. */}
                    <Link href={`/app/bookings/${r.id}`} className={buttonStyles.quiet}>
                      {w.answer.decline}
                    </Link>
                    <ActionForm action={confirmRequest} className="contents">
                      <input type="hidden" name="bookingId" value={r.id} />
                      <SubmitButton pendingLabel={m.booking.step.confirming}>{w.answer.confirm}</SubmitButton>
                    </ActionForm>
                  </div>
                </LedgerRow>
              ))}
            </Ledger>
          </Section>
        ) : null}
        {waitlisted.length > 0 ? (
          <Section title={w.waitlist.title} count={waitlisted.length}>
            <p className="mb-3 text-sm text-slate">{w.waitlist.about}</p>
            <Ledger>
              {waitlisted.map((r) => {
                const space = hasSpace.get(r.id) ?? false;
                return (
                  <LedgerRow key={r.id}>
                    <PetAvatar name={r.pets?.name ?? "?"} />
                    <div className="min-w-0 flex-[1_1_200px]">
                      <p className="flex flex-wrap items-center gap-2">
                        <Link href={`/app/bookings/${r.id}`} className="text-[16.5px] font-bold underline-offset-4 hover:underline">
                          {r.pets?.name ?? w.pet}
                        </Link>
                        <Badge tone={space ? "good" : "neutral"}>{space ? w.waitlist.free : w.waitlist.full}</Badge>
                      </p>
                      <p className="text-sm text-slate">{who(r, false)}</p>
                    </div>
                    {space && r.clients ? (
                      <a
                        href={whatsappLink(
                          spaceFreeMessage(
                            parentWords.m.whatsapp,
                            { kennelName: org.name, parentName: r.clients.full_name, petName: r.pets?.name ?? parentWords.m.whatsapp.yourPet, startDate: r.start_date, endDate: r.end_date },
                            parentWords.locale,
                          ),
                          r.clients.phone,
                        )}
                        target="_blank"
                        rel="noreferrer"
                        className={buttonStyles.whatsapp}
                      >
                        {m.today.waitlist.tell}
                      </a>
                    ) : (
                      <Link href={`/app/bookings/${r.id}`} className={buttonStyles.secondary}>
                        {m.today.open}
                      </Link>
                    )}
                  </LedgerRow>
                );
              })}
            </Ledger>
          </Section>
        ) : null}
      </div>
    </>
  );
}
