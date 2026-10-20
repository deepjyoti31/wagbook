import Link from "next/link";
import { Suspense } from "react";
import { buttonStyles, Empty, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { addDays, calendarDays, calendarGrid, isISODate, isOverstaying, todayIn, type ISODate } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.calendar.title);

const DAYS = 14;

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
    day: new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", timeZone: "UTC" }).format(d),
  };
}

async function Calendar({ searchParams }: Pick<PageProps<"/app/calendar">, "searchParams">) {
  const params = await searchParams;
  const { org } = await requireOrg();
  const { m, language, locale } = await getAppI18n();
  const w = m.calendar;
  const today = todayIn(org.time_zone);
  const from = typeof params.from === "string" && isISODate(params.from) ? params.from : today;
  const days = calendarDays(from, DAYS);
  const last = days[days.length - 1];

  const supabase = await createClient();
  const [kennels, stays, occupancy, requests] = await Promise.all([
    supabase.from("kennels").select("id, name, is_active").eq("org_id", org.id).order("sort_order").order("name"),
    supabase
      .from("bookings")
      .select("id, kind, status, start_date, end_date, kennel_id, pets(name)")
      .eq("org_id", org.id)
      .in("status", ["confirmed", "checked_in"])
      .lte("start_date", last)
      .gte("end_date", from)
      .limit(5000),
    supabase.rpc("occupancy_by_day", { p_org: org.id, p_from: from, p_to: last }),
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "requested").lte("start_date", last).gte("end_date", from),
  ]);
  if (kennels.error || stays.error || occupancy.error) throw new Error("Could not load the calendar.");

  const held = new Set(stays.data.map((s) => s.kennel_id));
  // Kennels out of service are shown only while a stay still sits in one.
  const rows = kennels.data.filter((k) => k.is_active || held.has(k.id));
  const grid = calendarGrid(
    rows.map((k) => k.id),
    stays.data.map((s) => ({
      id: s.id,
      kind: s.kind,
      status: s.status,
      startDate: s.start_date,
      // A pet still here after its check-out date is in its kennel today, even though the booking no longer holds it.
      endDate: s.status === "checked_in" && s.end_date <= today ? (s.kind === "daycare" ? today : addDays(today, 1)) : s.end_date,
      kennelId: s.kennel_id,
      pet: s.pets?.name ?? w.pet,
      overstay: isOverstaying({ status: s.status, endDate: s.end_date }, today),
    })),
    days,
  );
  const labels = days.map((d) => dayLabel(d, locale));
  const nav = (date: ISODate, label: string) => (
    <Link href={date === today ? "/app/calendar" : `/app/calendar?from=${date}`} className={buttonStyles.secondary}>
      {label}
    </Link>
  );

  return (
    <>
      <PageTitle title={w.title}>
        <Link href="/app/bookings/new" className={buttonStyles.primary}>
          {w.newBooking}
        </Link>
      </PageTitle>
      <div className="mb-4 flex flex-wrap gap-2">
        {nav(addDays(from, -DAYS), w.earlier)}
        {from !== today ? nav(today, w.today) : null}
        {nav(addDays(from, DAYS), w.later)}
      </div>
      {(requests.count ?? 0) > 0 ? (
        <p className="mb-4 rounded-lg bg-marigold-soft px-4 py-3">
          {plural(language, requests.count ?? 0, w.requests)}{" "}
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
        <div className="relative overflow-x-auto rounded-xl border border-rule bg-paper" role="region" aria-label={w.region} tabIndex={0}>
          <table className="border-collapse text-sm">
            <thead>
              <tr>
                <th scope="col" className="sticky left-0 z-10 min-w-16 border-b border-r border-rule bg-paper px-2 py-2 text-left">
                  {w.kennel}
                </th>
                {days.map((d, i) => (
                  <th key={d} scope="col" className={`min-w-16 border-b border-rule px-1 py-2 text-center font-semibold ${d === today ? "bg-marigold-soft" : ""}`}>
                    <span className="block text-slate">{labels[i].weekday}</span>
                    <span className="block whitespace-nowrap">{labels[i].day}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row" className="sticky left-0 z-10 border-b border-r border-rule bg-ground px-2 py-2 text-left">
                  {w.inHouse}
                </th>
                {(occupancy.data ?? []).map((o) => (
                  <td
                    key={o.day}
                    className={`border-b border-rule px-1 py-2 text-center font-bold ${o.capacity > 0 && o.occupied >= o.capacity ? "bg-alert-soft text-alert" : "bg-ground"}`}
                  >
                    {o.occupied}
                    <span className="font-normal text-slate">/{o.capacity}</span>
                    {o.pets > o.occupied ? <span className="block text-xs font-normal text-slate">{fill(w.petsShort, { n: o.pets })}</span> : null}
                  </td>
                ))}
              </tr>
              {rows.map((k) => (
                <tr key={k.id}>
                  <th scope="row" className="sticky left-0 z-10 border-b border-r border-rule bg-paper px-2 text-left">
                    <span className="door-tag">{k.name}</span>
                  </th>
                  {grid.byKennel.get(k.id)!.map((cell, i) => {
                    const day = days[i];
                    if (cell.length > 0) {
                      // Two siblings sharing the kennel are one above the other, each a full-height link.
                      return (
                        <td key={day} className="border-b border-rule p-0">
                          {cell.map((stay) => {
                            const starts = stay.startDate === day || i === 0;
                            return (
                              <Link
                                key={stay.id}
                                href={`/app/bookings/${stay.id}`}
                                className={`flex h-12 items-center overflow-hidden whitespace-nowrap px-1 font-semibold ${
                                  stay.overstay ? "bg-alert-soft text-alert" : stay.status === "checked_in" ? "bg-leaf-soft text-leaf" : "bg-ground text-ink"
                                }`}
                                title={stay.pet}
                              >
                                {starts ? stay.pet.slice(0, 9) : <span className="sr-only">{stay.pet}</span>}
                              </Link>
                            );
                          })}
                        </td>
                      );
                    }
                    return (
                      <td key={day} className="h-12 border-b border-rule p-0">
                        {day >= today && k.is_active ? (
                          <Link
                            href={`/app/bookings/new?kennel=${k.id}&start=${day}`}
                            className="flex h-12 items-center justify-center text-slate/60 hover:bg-marigold-soft hover:text-ink"
                          >
                            <span aria-hidden="true">+</span>
                            <span className="sr-only">{fill(w.bookFrom, { kennel: k.name, day: labels[i].day })}</span>
                          </Link>
                        ) : null}
                      </td>
                    );
                  })}
                </tr>
              ))}
              {grid.unassigned.some((d) => d.length > 0) ? (
                <tr>
                  <th scope="row" className="sticky left-0 z-10 border-r border-rule bg-paper px-2 py-2 text-left font-semibold">
                    {w.noKennelYet}
                  </th>
                  {grid.unassigned.map((list, i) => (
                    <td key={days[i]} className="px-1 py-2 text-center font-semibold" title={list.map((s) => s.pet).join(", ")}>
                      {list.length > 0 ? list.length : ""}
                    </td>
                  ))}
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-sm text-slate">{w.key}</p>
    </>
  );
}
