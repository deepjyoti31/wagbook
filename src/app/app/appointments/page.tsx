import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { appointmentsOn, workingPeople } from "@/lib/appointments";
import { requireOrg } from "@/lib/auth";
import { addDays, clockMinutes, formatDate, isISODate, localClock, todayIn } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.appointments.title);

export default function AppointmentsPage({ searchParams }: PageProps<"/app/appointments">) {
  return (
    <Suspense fallback={<Loading />}>
      <Appointments searchParams={searchParams} />
    </Suspense>
  );
}

/** Rows of the day's board are half hours. */
const ROW_MINUTES = 30;

async function Appointments({ searchParams }: Pick<PageProps<"/app/appointments">, "searchParams">) {
  const params = await searchParams;
  const { org, canManage } = await requireOrg();
  const { m, locale, language } = await getAppI18n();
  const w = m.appointments;
  if (!org.offers_appointments) {
    return (
      <>
        <PageTitle title={w.title} />
        <Notice tone="info">{w.off}</Notice>
      </>
    );
  }
  const today = todayIn(org.time_zone);
  const day = typeof params.date === "string" && isISODate(params.date) ? params.date : today;
  const supabase = await createClient();
  const [places, appointments, people] = await Promise.all([
    supabase.from("appointment_places").select("id, name, opens, closes").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    appointmentsOn(supabase, org.id, org.time_zone, day),
    workingPeople(supabase, org.id),
  ]);
  if (places.error || appointments.error || people.error) throw new Error("Could not load appointments.");
  const personName = (id: string | null) => people.data.find((p) => p.user_id === id)?.display_name ?? null;
  const clock = (iso: string) => localClock(iso, org.time_zone);

  // The board runs from the earliest opening to the latest closing, in half hours.
  const first = Math.min(...places.data.map((p) => clockMinutes(p.opens.slice(0, 5))));
  const last = Math.max(...places.data.map((p) => clockMinutes(p.closes.slice(0, 5))));
  const start = Math.floor(first / ROW_MINUTES) * ROW_MINUTES;
  const rows = places.data.length ? Math.ceil((last - start) / ROW_MINUTES) : 0;
  const rowOf = (iso: string) => Math.max(1, Math.round((clockMinutes(clock(iso)) - start) / ROW_MINUTES) + 1);

  return (
    <>
      <PageTitle title={w.title}>
        <Link href="/app/appointments/new" className={buttonStyles.primary}>
          {w.book}
        </Link>
        {canManage ? (
          <Link href="/app/more/appointments" className={buttonStyles.quiet}>
            {w.setup}
          </Link>
        ) : null}
      </PageTitle>

      <form action="/app/appointments" className="mb-5 flex flex-wrap items-end gap-2">
        <div className="w-44">
          <Field label={w.day}>
            <Input type="date" name="date" defaultValue={day} required />
          </Field>
        </div>
        <button type="submit" className={buttonStyles.secondary}>
          {w.show}
        </button>
        <Link href={`/app/appointments?date=${addDays(day, -1)}`} className={buttonStyles.quiet}>
          {w.previous}
        </Link>
        <Link href={`/app/appointments?date=${addDays(day, 1)}`} className={buttonStyles.quiet}>
          {w.next}
        </Link>
      </form>
      <p className="mb-4 text-lg font-semibold">
        {formatDate(day, locale)}: {plural(language, appointments.data.length, w.count)}
      </p>

      {places.data.length === 0 ? (
        <Notice tone="info">{w.noPlaces}</Notice>
      ) : (
        <Section title={w.board}>
          <p className="mb-2 text-sm text-slate">{w.boardHint}</p>
          {/* The columns scroll inside this box, never the page (360 pixels wide). */}
          <div className="max-w-full overflow-x-auto rounded-xl border border-rule bg-paper" data-board>
            <div
              className="grid"
              style={{ gridTemplateColumns: `3.5rem repeat(${places.data.length}, minmax(8.5rem, 1fr))`, gridTemplateRows: `auto repeat(${rows}, 2.25rem)` }}
            >
              <div className="sticky left-0 z-[2] border-b border-rule bg-paper px-2 py-2 text-sm font-semibold">{w.time}</div>
              {places.data.map((p, i) => (
                <div key={p.id} className="border-b border-l border-rule px-2 py-2 font-bold" style={{ gridColumn: i + 2, gridRow: 1 }}>
                  {p.name}
                </div>
              ))}
              {Array.from({ length: rows }, (_, r) => (
                <div key={r} className="sticky left-0 z-[2] border-t border-rule bg-paper px-2 text-sm tabular-nums text-slate" style={{ gridColumn: 1, gridRow: r + 2 }}>
                  {r % 2 === 0 ? `${String(Math.floor((start + r * ROW_MINUTES) / 60)).padStart(2, "0")}:${String((start + r * ROW_MINUTES) % 60).padStart(2, "0")}` : ""}
                </div>
              ))}
              {places.data.map((p, i) =>
                Array.from({ length: rows }, (_, r) => {
                  const minute = start + r * ROW_MINUTES;
                  const closed = minute < clockMinutes(p.opens.slice(0, 5)) || minute >= clockMinutes(p.closes.slice(0, 5));
                  return <div key={`${p.id}-${r}`} className={`border-l border-t border-rule ${closed ? "bg-ground" : ""}`} style={{ gridColumn: i + 2, gridRow: r + 2 }} />;
                }),
              )}
              {appointments.data.map((a) => {
                const col = places.data.findIndex((p) => p.id === a.place_id);
                if (col < 0) return null;
                const top = rowOf(a.starts_at) + 1;
                const end = Math.max(top + 1, rowOf(a.ends_at) + 1);
                const held = Math.max(end, rowOf(a.held_until) + 1);
                return (
                  <div key={a.id} className="contents">
                    <Link
                      href={`/app/appointments/${a.id}`}
                      className={`z-[1] m-0.5 overflow-hidden rounded-md px-2 py-1 text-sm leading-tight ${a.status === "requested" ? "border-2 border-dashed border-ink bg-paper" : a.status === "done" ? "bg-leaf-soft text-ink" : "bg-ink text-paper"}`}
                      style={{ gridColumn: col + 2, gridRow: `${top} / ${end}` }}
                    >
                      <span className="block font-bold">
                        {clock(a.starts_at)} {a.pets?.name}
                      </span>
                      <span className="block">{a.appointment_services?.name}</span>
                    </Link>
                    {held > end ? (
                      <div className="m-0.5 rounded-md bg-marigold-soft px-2 text-xs" style={{ gridColumn: col + 2, gridRow: `${end} / ${held}` }}>
                        {w.cleaning}
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
          </div>
        </Section>
      )}

      <Section title={w.list} count={appointments.data.length}>
        {appointments.data.length === 0 ? (
          <Empty>{w.empty}</Empty>
        ) : (
          <Ledger>
            {appointments.data.map((a) => {
              const person = personName(a.staff_id);
              return (
                <li key={a.id}>
                  <Link href={`/app/appointments/${a.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-ground">
                    <span className="font-bold tabular-nums">{clock(a.starts_at)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-bold">{a.pets?.name}</span> {a.appointment_services?.name}
                      <span className="block text-sm text-slate">
                        {[places.data.find((p) => p.id === a.place_id)?.name, person ? fill(w.with, { person }) : null, a.booking_id ? w.boarder : w.visitor].filter(Boolean).join(", ")}
                      </span>
                    </span>
                    <Badge tone={a.status === "requested" ? "attention" : a.status === "done" ? "good" : "neutral"}>{m.appointmentStatus[a.status]}</Badge>
                  </Link>
                </li>
              );
            })}
          </Ledger>
        )}
      </Section>
    </>
  );
}
