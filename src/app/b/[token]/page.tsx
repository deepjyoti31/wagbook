import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { HtmlLang } from "@/components/html-lang";
import { PhotoInput } from "@/components/photo-input";
import { buttonStyles, Empty, Field, Input, Loading, Section, Select, Textarea } from "@/components/ui";
import { datesText } from "@/lib/bookings";
import { addDays, formatDate, isISODate, whatsappLink, type ISODate } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { parentI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";
import { reportDeliveryProblem, submitAppointmentRequest, submitBookingRequest, submitFoodRequest } from "./actions";

interface PublicBookingForm {
  kennel: { name: string; whatsapp_phone: string | null; check_in_time: string; check_out_time: string; language: string; locale: string | null };
  enabled: boolean;
  parent: string;
  today: ISODate;
  pets: { id: string; name: string }[];
  kinds: ("boarding" | "daycare")[];
  stays: { pet: string; kind: "boarding" | "daycare"; start_date: ISODate; end_date: ISODate; status: "requested" | "confirmed" | "checked_in" }[];
  food_cutoff_hours: number;
  problem_window_hours: number;
  /** The parent's food subscriptions, when the kennel delivers (M32). */
  food: { id: string; pet: string; paused_from: ISODate | null; paused_until: ISODate | null; next: { date: ISODate; status: string }[] | null }[] | null;
  /** Their deliveries handed over within the problem window, to say one went wrong (M59). */
  recent_deliveries: { id: string; pet: string; date: ISODate; reported: boolean }[] | null;
  /** Appointments the parent may ask for, when the kennel offers them (M59). */
  appointment_services: { id: string; name: string; kind: string; minutes: number }[] | null;
  /** Free times on the day asked about, for the service asked about. */
  free_times: string[] | null;
  /** Their appointments still to come. */
  appointments: { pet: string; service: string; status: "requested" | "confirmed"; date: ISODate; time: string }[] | null;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** The form behind a parent's booking link, or null. Read once per request, for the title and the page. */
const loadForm = cache(async (token: string, service: string | null = null, day: string | null = null): Promise<PublicBookingForm | null> => {
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await createAnonClient().rpc("get_public_booking_form", {
    p_token: token,
    p_service: service ?? undefined,
    p_day: day ?? undefined,
  });
  if (error || !data) return null;
  return data as unknown as PublicBookingForm;
});

export async function generateMetadata({ params }: PageProps<"/b/[token]">): Promise<Metadata> {
  const f = await loadForm((await params).token);
  return { title: parentI18n(f?.kennel.language).m.requestForm.title, robots: { index: false } };
}

/** A known parent's own page for asking the kennel for a stay. No sign-in (D36). */
export default function BookingRequestPage({ params, searchParams }: PageProps<"/b/[token]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Suspense fallback={<Loading />}>
        <RequestForm params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function RequestForm({ params, searchParams }: Pick<PageProps<"/b/[token]">, "params" | "searchParams">) {
  const { token } = await params;
  const query = await searchParams;
  // An appointment being asked for (M59): the service, pet and day chosen so far.
  const service = typeof query.service === "string" && UUID.test(query.service) ? query.service : null;
  const day = typeof query.day === "string" && isISODate(query.day) ? query.day : null;
  const petAsked = typeof query.pet === "string" && UUID.test(query.pet) ? query.pet : null;
  const f = await loadForm(token, service, day);
  if (!f) notFound();
  const t = parentI18n(f.kennel.language, f.kennel.locale);
  const { language, m } = t;
  const w = m.requestForm;
  const contact = f.kennel.whatsapp_phone ? whatsappLink("", f.kennel.whatsapp_phone) : null;
  const open = f.enabled && f.kinds.length > 0 && f.pets.length > 0;
  // Deliveries handed over within the window, to say one went wrong (M59).
  const recent = f.recent_deliveries ?? [];
  const told = recent.filter((d) => d.reported);
  const untold = recent.filter((d) => !d.reported);

  return (
    <div lang={language} className="space-y-6">
      <HtmlLang lang={language} />
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight">{f.kennel.name}</h1>
        <p className="mt-2 text-lg">{fill(w.hello, { parent: f.parent, kennel: f.kennel.name })}</p>
        <p className="mt-1 text-slate">{fill(w.times, { in: f.kennel.check_in_time.slice(0, 5), out: f.kennel.check_out_time.slice(0, 5) })}</p>
      </div>

      {open ? (
        <ActionForm action={submitBookingRequest.bind(null, token, language)} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <fieldset className="space-y-1">
            <legend className="font-semibold">{w.pets}</legend>
            {f.pets.map((p) => (
              <label key={p.id} className="flex min-h-12 items-center gap-3">
                <input type="checkbox" name="pet_id" value={p.id} defaultChecked={f.pets.length === 1} className="size-5" />
                <span>{p.name}</span>
              </label>
            ))}
          </fieldset>
          {f.kinds.length > 1 ? (
            <Field label={w.kind}>
              <Select name="kind" defaultValue="boarding">
                <option value="boarding">{w.boarding}</option>
                <option value="daycare">{w.daycare}</option>
              </Select>
            </Field>
          ) : (
            <input type="hidden" name="kind" value={f.kinds[0]} />
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={w.checkIn}>
              <Input name="start_date" type="date" required min={f.today} />
            </Field>
            <Field label={w.checkOut} hint={f.kinds.includes("daycare") ? w.checkOutHint : undefined}>
              <Input name="end_date" type="date" min={f.today} required={!f.kinds.includes("daycare")} />
            </Field>
          </div>
          <Field label={w.note}>
            <Textarea name="note" maxLength={1000} rows={3} />
          </Field>
          <SubmitButton pendingLabel={w.sending}>{w.send}</SubmitButton>
        </ActionForm>
      ) : (
        <p className="rounded-xl border border-rule bg-paper p-6 text-lg">{f.pets.length === 0 ? w.noPets : fill(w.closed, { kennel: f.kennel.name })}</p>
      )}

      {f.stays.length > 0 ? (
        <Section title={w.yourStays} count={f.stays.length}>
          <ul className="space-y-1">
            {f.stays.map((s, i) => (
              <li key={i} className="flex flex-wrap items-center gap-2">
                <span className="font-semibold">{s.pet}</span>
                <span className="text-slate">{datesText(t, s.start_date, s.end_date)}</span>
                <span className="text-sm">{w.status[s.status]}</span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {f.enabled && f.appointment_services && f.appointment_services.length > 0 && f.pets.length > 0 ? (
        <Section title={m.appointmentLink.title}>
          <p className="mb-3 text-slate">{m.appointmentLink.about}</p>
          <form action={`/b/${token}`} className="mb-4 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <Field label={m.appointmentLink.service}>
              <Select name="service" defaultValue={service ?? f.appointment_services[0].id}>
                {f.appointment_services.map((s) => (
                  <option key={s.id} value={s.id}>
                    {fill(m.appointmentLink.serviceOption, { name: s.name, minutes: s.minutes })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={m.appointmentLink.pet}>
              <Select name="pet" defaultValue={petAsked ?? f.pets[0].id}>
                {f.pets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={m.appointmentLink.day}>
              <Input type="date" name="day" min={f.today} max={addDays(f.today, 60)} defaultValue={day ?? f.today} required />
            </Field>
            <button type="submit" className={buttonStyles.secondary}>
              {m.appointmentLink.showTimes}
            </button>
          </form>
          {service && day && f.free_times ? (
            f.free_times.length === 0 ? (
              <Empty>{m.appointmentLink.noTimes}</Empty>
            ) : (
              <ActionForm action={submitAppointmentRequest.bind(null, token, language)} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
                <input type="hidden" name="service_id" value={service} />
                <input type="hidden" name="pet_id" value={petAsked ?? f.pets[0].id} />
                <input type="hidden" name="date" value={day} />
                <fieldset>
                  <legend className="mb-2 font-semibold">{fill(m.appointmentLink.times, { date: formatDate(day, t.locale) })}</legend>
                  <div className="flex flex-wrap gap-2">
                    {f.free_times.map((time, i) => (
                      <label key={time} className="flex min-h-12 cursor-pointer items-center gap-2 rounded-lg border-2 border-rule px-3 has-[:checked]:border-ink has-[:checked]:bg-ground">
                        <input type="radio" name="time" value={time} defaultChecked={i === 0} className="size-5" />
                        <span className="font-semibold tabular-nums">{time}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label={w.note}>
                  <Textarea name="note" maxLength={500} rows={2} />
                </Field>
                <SubmitButton pendingLabel={w.sending}>{m.appointmentLink.send}</SubmitButton>
              </ActionForm>
            )
          ) : null}
          {f.appointments && f.appointments.length > 0 ? (
            <div className="mt-4">
              <p className="mb-1 font-semibold">{m.appointmentLink.yours}</p>
              <ul className="space-y-1">
                {f.appointments.map((a, i) => (
                  <li key={i} className="flex flex-wrap items-center gap-2">
                    <span>{fill(m.appointmentLink.line, { pet: a.pet, service: a.service, date: formatDate(a.date, t.locale), time: a.time })}</span>
                    <span className="text-sm">{m.appointmentLink.status[a.status]}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      ) : null}

      {f.food && f.food.length > 0 ? (
        <Section title={m.foodLink.title} count={f.food.length}>
          <ul className="mb-3 space-y-2">
            {f.food.map((s) => (
              <li key={s.id}>
                <p className="font-semibold">{s.pet}</p>
                {s.next && s.next.length > 0 ? (
                  <p className="text-slate">{fill(m.foodLink.next, { dates: s.next.map((n) => formatDate(n.date, t.locale)).join(", ") })}</p>
                ) : null}
                {s.paused_from ? (
                  <p className="text-slate">
                    {s.paused_until
                      ? fill(m.foodLink.paused, { from: formatDate(s.paused_from, t.locale), until: formatDate(s.paused_until, t.locale) })
                      : fill(m.foodLink.pausedOpen, { from: formatDate(s.paused_from, t.locale) })}
                  </p>
                ) : null}
              </li>
            ))}
          </ul>
          <ActionForm action={submitFoodRequest.bind(null, token, language)} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <fieldset className="space-y-1">
              <legend className="font-semibold">{m.foodLink.what}</legend>
              {(["pause", "skip", "more"] as const).map((k) => (
                <label key={k} className="flex min-h-12 items-center gap-3">
                  <input type="radio" name="kind" value={k} defaultChecked={k === "pause"} className="size-5" />
                  <span>{m.foodLink.kinds[k]}</span>
                </label>
              ))}
            </fieldset>
            {f.food.length > 1 ? (
              <Field label={m.foodLink.which}>
                <Select name="subscription_id">
                  {f.food.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.pet}
                    </option>
                  ))}
                </Select>
              </Field>
            ) : (
              <input type="hidden" name="subscription_id" value={f.food[0].id} />
            )}
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={m.foodLink.from}>
                <Input name="from" type="date" required min={f.today} />
              </Field>
              <Field label={m.foodLink.until}>
                <Input name="until" type="date" min={f.today} />
              </Field>
              <Field label={m.foodLink.kg}>
                <Input name="kg" inputMode="decimal" />
              </Field>
            </div>
            <Field label={m.foodLink.note}>
              <Textarea name="note" maxLength={1000} rows={2} />
            </Field>
            <p className="text-sm text-slate">{fill(m.foodLink.cutoff, { hours: f.food_cutoff_hours })}</p>
            <SubmitButton pendingLabel={w.sending}>{m.foodLink.send}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {f.enabled && recent.length > 0 ? (
        <Section title={m.problemLink.title}>
          <p className="mb-3 text-slate">{fill(m.problemLink.about, { hours: f.problem_window_hours })}</p>
          {told.length > 0 ? (
            <ul className="mb-3 space-y-1">
              {told.map((d) => (
                <li key={d.id} className="text-slate">
                  {fill(m.problemLink.told, { pet: d.pet, date: formatDate(d.date, t.locale) })}
                </li>
              ))}
            </ul>
          ) : null}
          {untold.length > 0 ? (
            <ActionForm action={reportDeliveryProblem.bind(null, token, language, f.kennel.name)} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
              <Field label={m.problemLink.which}>
                <Select name="delivery_id" defaultValue={untold[0].id}>
                  {untold.map((d) => (
                    <option key={d.id} value={d.id}>
                      {fill(m.problemLink.option, { pet: d.pet, date: formatDate(d.date, t.locale) })}
                    </option>
                  ))}
                </Select>
              </Field>
              <fieldset>
                <legend className="mb-1 font-semibold">{m.problemLink.what}</legend>
                <div className="flex flex-wrap gap-2">
                  {(["damaged", "late", "wrong"] as const).map((k, i) => (
                    <label key={k} className="flex min-h-12 items-center gap-2 rounded-lg border-2 border-rule px-3 has-[:checked]:border-ink">
                      <input type="radio" name="problem" value={k} defaultChecked={i === 0} className="size-5" />
                      {m.problemKinds[k]}
                    </label>
                  ))}
                </div>
              </fieldset>
              <Field label={m.problemLink.note}>
                <Textarea name="note" maxLength={500} rows={2} />
              </Field>
              <PhotoInput name="photo" label={m.problemLink.photo} words={m.photos} />
              <SubmitButton pendingLabel={w.sending}>{m.problemLink.send}</SubmitButton>
            </ActionForm>
          ) : null}
        </Section>
      ) : null}

      {contact ? (
        <a href={contact} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
          {fill(w.messageKennel, { kennel: f.kennel.name })}
        </a>
      ) : null}
    </div>
  );
}
