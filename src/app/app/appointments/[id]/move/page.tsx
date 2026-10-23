import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { appointmentsOn, HOLDING, workingPeople } from "@/lib/appointments";
import { requireOrg } from "@/lib/auth";
import { formatDate, freeTimes, isISODate, localClock, localDate, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { moveAppointment } from "../../actions";

export const generateMetadata = () => appTitle((m) => m.moveAppointment.title);

export default function MoveAppointmentPage({ params, searchParams }: PageProps<"/app/appointments/[id]/move">) {
  return (
    <Suspense fallback={<Loading />}>
      <MoveAppointment params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);

/**
 * Move an appointment (M58): pick a new day, and the place and person if
 * they change, then one of the free times. The appointment itself does not
 * count against its own free times.
 */
async function MoveAppointment({ params, searchParams }: Pick<PageProps<"/app/appointments/[id]/move">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const w = m.moveAppointment;
  const supabase = await createClient();
  const res = await supabase
    .from("appointments")
    .select("id, status, starts_at, ends_at, place_id, staff_id, pet_id, cleanup_minutes, pets!appointments_org_id_client_id_pet_id_fkey(name), appointment_services(name)")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (res.error) throw new Error("Could not load the appointment.");
  if (!res.data) notFound();
  const a = res.data;
  const back = (
    <Link href={`/app/appointments/${a.id}`} className={buttonStyles.quiet}>
      {m.appointment.title}
    </Link>
  );
  if (a.status !== "requested" && a.status !== "confirmed") {
    return (
      <>
        <PageTitle title={w.title}>{back}</PageTitle>
        <Notice tone="info">{w.notOpen}</Notice>
      </>
    );
  }

  const [places, people] = await Promise.all([
    supabase.from("appointment_places").select("id, name, opens, closes").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    workingPeople(supabase, org.id),
  ]);
  if (places.error || people.error) throw new Error("Could not load the form.");
  const today = todayIn(org.time_zone);
  const was = localDate(a.starts_at, org.time_zone);
  const day = typeof query.date === "string" && isISODate(query.date) ? query.date : was < today ? today : was;
  const place = places.data.find((x) => x.id === (uuid(query.place) ?? a.place_id)) ?? null;
  const personId = typeof query.person === "string" ? uuid(query.person) : a.staff_id;
  const person = people.data.find((x) => x.user_id === personId) ?? null;
  const minutes = Math.round((new Date(a.ends_at).getTime() - new Date(a.starts_at).getTime()) / 60_000);
  const dayAppointments = place ? await appointmentsOn(supabase, org.id, org.time_zone, day) : { data: [], error: null };
  if (dayAppointments.error) throw new Error("Could not load free times.");
  const others = (dayAppointments.data ?? []).filter((x) => x.id !== a.id && (HOLDING as readonly string[]).includes(x.status));
  const times = place
    ? freeTimes({
        day,
        opens: place.opens.slice(0, 5),
        closes: place.closes.slice(0, 5),
        minutes,
        cleanup: a.cleanup_minutes,
        timeZone: org.time_zone,
        now: new Date(),
        place: others.filter((x) => x.place_id === place.id).map((x) => ({ start: x.starts_at, end: x.held_until })),
        pet: others.filter((x) => x.pet_id === a.pet_id).map((x) => ({ start: x.starts_at, end: x.ends_at })),
        person: person ? others.filter((x) => x.staff_id === person.user_id).map((x) => ({ start: x.starts_at, end: x.ends_at })) : [],
      })
    : [];
  const clock = (iso: string) => localClock(iso, org.time_zone);

  return (
    <>
      <PageTitle title={w.title}>{back}</PageTitle>
      <p className="mb-1 text-lg">
        <span className="font-bold">{a.pets?.name}</span>, {a.appointment_services?.name}
      </p>
      <p className="mb-4 text-slate">{fill(w.now, { date: formatDate(was, locale), from: clock(a.starts_at), to: clock(a.ends_at) })}</p>

      <form action={`/app/appointments/${a.id}/move`} className="mb-6 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
        <Field label={w.date}>
          <Input type="date" name="date" min={today} defaultValue={day} required />
        </Field>
        <Field label={w.place}>
          <Select name="place" defaultValue={place?.id ?? ""}>
            {places.data.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={w.person}>
          <Select name="person" defaultValue={person?.user_id ?? ""}>
            <option value="">{m.appointment.nobody}</option>
            {people.data.map((x) => (
              <option key={x.user_id} value={x.user_id}>
                {x.display_name}
              </option>
            ))}
          </Select>
        </Field>
        <button type="submit" className={buttonStyles.secondary}>
          {w.showTimes}
        </button>
      </form>

      {place ? (
        <Section title={fill(w.times, { date: formatDate(day, locale) })}>
          {times.length === 0 ? (
            <Empty>{w.timesEmpty}</Empty>
          ) : (
            <ActionForm action={moveAppointment} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
              <input type="hidden" name="appointmentId" value={a.id} />
              <input type="hidden" name="date" value={day} />
              <input type="hidden" name="placeId" value={place.id} />
              <input type="hidden" name="staffId" value={person?.user_id ?? ""} />
              <fieldset>
                <legend className="mb-2 font-semibold">{fill(w.lasts, { minutes })}</legend>
                <div className="flex flex-wrap gap-2">
                  {times.map((time, i) => (
                    <label key={time} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-2 border-rule px-3 has-[:checked]:border-ink has-[:checked]:bg-ground">
                      <input type="radio" name="time" value={time} defaultChecked={i === 0} className="size-5" />
                      <span className="font-semibold tabular-nums">{time}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              <SubmitButton pendingLabel={m.common.saving}>{w.button}</SubmitButton>
            </ActionForm>
          )}
        </Section>
      ) : (
        <Notice tone="info">{m.appointments.noPlaces}</Notice>
      )}
    </>
  );
}
