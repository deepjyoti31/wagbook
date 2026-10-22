import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { VaccinationWarnings } from "@/components/pet-panels";
import { buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { appointmentsOn, workingPeople } from "@/lib/appointments";
import { requireOrg } from "@/lib/auth";
import { appointmentPrice, formatDate, formatMoney, freeTimes, isISODate, todayIn, vaccinationWarnings } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { bookAppointment } from "../actions";

export const generateMetadata = () => appTitle((m) => m.newAppointment.title);

export default function NewAppointmentPage({ searchParams }: PageProps<"/app/appointments/new">) {
  return (
    <Suspense fallback={<Loading />}>
      <NewAppointment searchParams={searchParams} />
    </Suspense>
  );
}

const uuid = (v: unknown) => (typeof v === "string" && /^[0-9a-f-]{36}$/.test(v) ? v : null);

async function NewAppointment({ searchParams }: Pick<PageProps<"/app/appointments/new">, "searchParams">) {
  const params = await searchParams;
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const w = m.newAppointment;
  if (!org.offers_appointments) {
    return (
      <>
        <PageTitle title={w.title} />
        <Notice tone="info">{m.appointments.off}</Notice>
      </>
    );
  }
  const supabase = await createClient();
  const today = todayIn(org.time_zone);
  const petId = uuid(params.pet);
  const back = (
    <Link href="/app/appointments" className={buttonStyles.quiet}>
      {m.appointments.title}
    </Link>
  );

  if (!petId) {
    const pets = await supabase.from("pets").select("id, name, clients(full_name)").eq("org_id", org.id).is("deleted_at", null).order("name").limit(1000);
    if (pets.error) throw new Error("Could not load pets.");
    return (
      <>
        <PageTitle title={w.title}>{back}</PageTitle>
        {pets.data.length === 0 ? (
          <Empty>{m.pets.none}</Empty>
        ) : (
          <form action="/app/appointments/new" className="flex flex-wrap items-end gap-2 rounded-xl border border-rule bg-paper p-4">
            {typeof params.date === "string" ? <input type="hidden" name="date" value={params.date} /> : null}
            <div className="min-w-56 flex-1">
              <Field label={w.pet}>
                <Select name="pet" required defaultValue="">
                  <option value="" disabled>
                    {w.choosePet}
                  </option>
                  {pets.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.clients?.full_name})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <button type="submit" className={buttonStyles.primary}>
              {w.next}
            </button>
          </form>
        )}
      </>
    );
  }

  const [pet, services, places, people, prices, vaccinations] = await Promise.all([
    supabase.from("pets").select("id, name, breed, coat, weight_g, client_id, clients(full_name)").eq("org_id", org.id).eq("id", petId).maybeSingle(),
    supabase.from("appointment_services").select("id, kind, name, minutes, cleanup_minutes, place_id, pricing, price_minor, skill").eq("org_id", org.id).eq("is_active", true).eq("is_addon", false).order("kind").order("name"),
    supabase.from("appointment_places").select("id, name, opens, closes").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    workingPeople(supabase, org.id),
    supabase.from("appointment_service_prices").select("service_id, size, coat, breed, price_minor").eq("org_id", org.id),
    supabase.from("vaccinations").select("vaccine, valid_until").eq("org_id", org.id).eq("pet_id", petId),
  ]);
  if (pet.error || !pet.data || services.error || places.error || people.error || prices.error || vaccinations.error) throw new Error("Could not load the form.");
  const p = pet.data;
  if (services.data.length === 0 || places.data.length === 0) {
    return (
      <>
        <PageTitle title={w.title}>{back}</PageTitle>
        <Notice tone="info">{m.appointments.noPlaces}</Notice>
      </>
    );
  }
  const service = services.data.find((s) => s.id === uuid(params.service)) ?? null;
  const day = typeof params.date === "string" && isISODate(params.date) ? params.date : today;
  const place = places.data.find((x) => x.id === (uuid(params.place) ?? service?.place_id)) ?? null;
  const person = people.data.find((x) => x.user_id === uuid(params.person)) ?? null;
  const minutesParam = Number(params.minutes);
  const minutes = Number.isInteger(minutesParam) && minutesParam >= 5 && minutesParam <= 720 ? minutesParam : (service?.minutes ?? 60);
  const inPackage = params.package === "1";
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  // People with the service's skill first (B14); everyone may be chosen.
  const skilled = service?.skill ? people.data.filter((x) => (x.skills ?? []).includes(service.skill!)) : [];
  const others = people.data.filter((x) => !skilled.includes(x));

  const [stay, courses, dayAppointments] = await Promise.all([
    supabase
      .from("bookings")
      .select("id, start_date, end_date")
      .eq("org_id", org.id)
      .eq("pet_id", p.id)
      .in("status", ["requested", "confirmed", "checked_in"])
      .lte("start_date", day)
      .gte("end_date", day)
      .limit(1)
      .maybeSingle(),
    service ? supabase.from("course_balances").select("course_id, name, sessions_left").eq("org_id", org.id).eq("pet_id", p.id).eq("service_id", service.id).gt("sessions_left", 0) : Promise.resolve({ data: [], error: null }),
    service && place ? appointmentsOn(supabase, org.id, org.time_zone, day) : Promise.resolve({ data: [], error: null }),
  ]);
  if (dayAppointments.error || courses.error) throw new Error("Could not load free times.");
  const holds = (a: { status: string }) => a.status === "confirmed" || a.status === "done";
  const times =
    service && place
      ? freeTimes({
          day,
          opens: place.opens.slice(0, 5),
          closes: place.closes.slice(0, 5),
          minutes,
          cleanup: service.cleanup_minutes,
          timeZone: org.time_zone,
          now: new Date(),
          place: (dayAppointments.data ?? []).filter((a) => holds(a) && a.place_id === place.id).map((a) => ({ start: a.starts_at, end: a.held_until })),
          pet: (dayAppointments.data ?? []).filter((a) => holds(a) && a.pet_id === p.id).map((a) => ({ start: a.starts_at, end: a.ends_at })),
          person: person ? (dayAppointments.data ?? []).filter((a) => holds(a) && a.staff_id === person.user_id).map((a) => ({ start: a.starts_at, end: a.ends_at })) : [],
        })
      : [];
  const price = service
    ? appointmentPrice(
        service,
        { weight_g: p.weight_g, coat: p.coat, breed: p.breed },
        prices.data.filter((x) => x.service_id === service.id),
        org,
      )
    : null;

  return (
    <>
      <PageTitle title={w.title}>{back}</PageTitle>
      <p className="mb-4 text-lg">
        <span className="font-bold">{p.name}</span>, {p.clients?.full_name}{" "}
        <Link href="/app/appointments/new" className="text-base underline underline-offset-4">
          {m.common.change}
        </Link>
      </p>

      <form action="/app/appointments/new" className="mb-6 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
        <input type="hidden" name="pet" value={p.id} />
        {inPackage ? <input type="hidden" name="package" value="1" /> : null}
        <Field label={w.service}>
          <Select name="service" defaultValue={service?.id ?? services.data[0].id}>
            {services.data.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({m.appointmentKinds[s.kind]})
              </option>
            ))}
          </Select>
        </Field>
        <Field label={w.date}>
          <Input type="date" name="date" min={today} defaultValue={day} required />
        </Field>
        <Field label={w.place}>
          <Select name="place" defaultValue={place?.id ?? ""}>
            <option value="">{w.nobody}</option>
            {places.data.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={w.person}>
          <Select name="person" defaultValue={person?.user_id ?? ""}>
            <option value="">{w.nobody}</option>
            {skilled.length > 0 ? (
              <optgroup label={w.withSkill}>
                {skilled.map((x) => (
                  <option key={x.user_id} value={x.user_id}>
                    {x.display_name}
                  </option>
                ))}
              </optgroup>
            ) : null}
            <optgroup label={skilled.length > 0 ? w.others : w.person}>
              {others.map((x) => (
                <option key={x.user_id} value={x.user_id}>
                  {x.display_name}
                </option>
              ))}
            </optgroup>
          </Select>
        </Field>
        <Field label={w.minutes}>
          <Input name="minutes" inputMode="numeric" defaultValue={service ? String(minutes) : ""} />
        </Field>
        <button type="submit" className={buttonStyles.secondary}>
          {w.showTimes}
        </button>
      </form>

      {service && place ? (
        <Section title={w.times}>
          <VaccinationWarnings t={t} warnings={vaccinationWarnings(vaccinations.data, { startDate: day, endDate: day })} />
          <p className="mb-2">{stay.data ? fill(w.onStay, { pet: p.name, dates: `${formatDate(stay.data.start_date, locale)} to ${formatDate(stay.data.end_date, locale)}` }) : fill(w.visit, { pet: p.name })}</p>
          <p className="mb-3 font-semibold">{inPackage && stay.data ? w.package : price === null ? w.quote : fill(w.price, { price: money(price) })}</p>
          <p className="mb-3 text-sm text-slate">{fill(w.timesAbout, { pet: p.name })}</p>
          {times.length === 0 ? (
            <Empty>{w.timesEmpty}</Empty>
          ) : (
            <ActionForm action={bookAppointment} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
              <input type="hidden" name="petId" value={p.id} />
              <input type="hidden" name="serviceId" value={service.id} />
              <input type="hidden" name="date" value={day} />
              <input type="hidden" name="placeId" value={place.id} />
              <input type="hidden" name="minutes" value={minutes} />
              <input type="hidden" name="staffId" value={person?.user_id ?? ""} />
              {inPackage ? <input type="hidden" name="inPackage" value="on" /> : null}
              <fieldset>
                <legend className="mb-2 font-semibold">{w.times}</legend>
                <div className="flex flex-wrap gap-2">
                  {times.map((time, i) => (
                    <label key={time} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-2 border-rule px-3 has-[:checked]:border-ink has-[:checked]:bg-ground">
                      <input type="radio" name="time" value={time} defaultChecked={i === 0} className="size-5" />
                      <span className="font-semibold tabular-nums">{time}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
              {(courses.data ?? []).length > 0 ? (
                <Field label={w.course}>
                  <Select name="courseId" defaultValue={courses.data![0].course_id ?? ""}>
                    <option value="">{w.noCourse}</option>
                    {courses.data!.map((c) => (
                      <option key={c.course_id} value={c.course_id ?? ""}>
                        {fill(w.courseOption, { name: c.name ?? "", left: c.sessions_left ?? 0 })}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              {canManage && !inPackage ? (
                <Field label={w.setPrice}>
                  <Input name="price" inputMode="decimal" />
                </Field>
              ) : null}
              <Field label={w.notes}>
                <Textarea name="notes" maxLength={500} />
              </Field>
              <label className="flex min-h-12 items-center gap-2 font-semibold">
                <input type="checkbox" name="request" defaultChecked={price === null && !inPackage && !canManage} className="size-5" />
                {w.request}
              </label>
              <SubmitButton pendingLabel={m.common.saving}>{w.bookButton}</SubmitButton>
            </ActionForm>
          )}
        </Section>
      ) : null}
    </>
  );
}
