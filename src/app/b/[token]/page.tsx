import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { HtmlLang } from "@/components/html-lang";
import { buttonStyles, Field, Input, Loading, Section, Select, Textarea } from "@/components/ui";
import { datesText } from "@/lib/bookings";
import { formatDate, whatsappLink, type ISODate } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { parentI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";
import { submitBookingRequest, submitFoodRequest } from "./actions";

interface PublicBookingForm {
  kennel: { name: string; whatsapp_phone: string | null; check_in_time: string; check_out_time: string; language: string; locale: string | null };
  enabled: boolean;
  parent: string;
  today: ISODate;
  pets: { id: string; name: string }[];
  kinds: ("boarding" | "daycare")[];
  stays: { pet: string; kind: "boarding" | "daycare"; start_date: ISODate; end_date: ISODate; status: "requested" | "confirmed" | "checked_in" }[];
  food_cutoff_hours: number;
  /** The parent's food subscriptions, when the kennel delivers (M32). */
  food: { id: string; pet: string; paused_from: ISODate | null; paused_until: ISODate | null; next: { date: ISODate; status: string }[] | null }[] | null;
}

/** The form behind a parent's booking link, or null. Read once per request, for the title and the page. */
const loadForm = cache(async (token: string): Promise<PublicBookingForm | null> => {
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) return null;
  const { data, error } = await createAnonClient().rpc("get_public_booking_form", { p_token: token });
  if (error || !data) return null;
  return data as unknown as PublicBookingForm;
});

export async function generateMetadata({ params }: PageProps<"/b/[token]">): Promise<Metadata> {
  const f = await loadForm((await params).token);
  return { title: parentI18n(f?.kennel.language).m.requestForm.title, robots: { index: false } };
}

/** A known parent's own page for asking the kennel for a stay. No sign-in (D36). */
export default function BookingRequestPage({ params }: PageProps<"/b/[token]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Suspense fallback={<Loading />}>
        <RequestForm params={params} />
      </Suspense>
    </main>
  );
}

async function RequestForm({ params }: Pick<PageProps<"/b/[token]">, "params">) {
  const { token } = await params;
  const f = await loadForm(token);
  if (!f) notFound();
  const t = parentI18n(f.kennel.language, f.kennel.locale);
  const { language, m } = t;
  const w = m.requestForm;
  const contact = f.kennel.whatsapp_phone ? whatsappLink("", f.kennel.whatsapp_phone) : null;
  const open = f.enabled && f.kinds.length > 0 && f.pets.length > 0;

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

      {contact ? (
        <a href={contact} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
          {fill(w.messageKennel, { kennel: f.kennel.name })}
        </a>
      ) : null}
    </div>
  );
}
