"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/action-form";
import { Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { bookingEstimate, formatMoney } from "@/lib/core";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import type { Messages } from "@/messages";

/** What get_public_intake_form() tells the booking form about a kennel (M41). */
export interface BookingFormKennel {
  name: string;
  notice: string;
  currency: string;
  locale: string;
  delivers?: boolean;
  prices: { boarding: number | null; daycare: number | null };
  services: { id: string; kind: string; name: string; minutes: number; price_minor: number | null; from: boolean }[];
}

/**
 * The booking form a new parent fills in: what, when, pick-up from home, the
 * pet, a tick for vaccinations and a phone number. The estimate follows what
 * is chosen (bookingEstimate); nothing is charged.
 */
export function BookingForm({
  action,
  kennel,
  words: w,
  intake,
  shared,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  kennel: BookingFormKennel;
  words: Messages["bookingForm"];
  intake: Messages["intakeForm"];
  shared: { species: Messages["labels"]["species"]; sex: Messages["labels"]["sex"]; yes: string; no: string };
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const stays = (["boarding", "daycare"] as const).filter((k) => kennel.prices[k] !== null);
  const [what, setWhat] = useState<string>(stays[0] ?? kennel.services[0]?.id ?? "boarding");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [pickup, setPickup] = useState(false);
  const appointment = what !== "boarding" && what !== "daycare";
  const estimate = bookingEstimate({ what, start: start || null, end: end || null }, { ...kennel.prices, services: kennel.services });
  const money = (minor: number) => formatMoney(minor, { currency: kennel.currency, locale: kennel.locale, trimZeros: true });

  if (state.ok) {
    return (
      <div className="rounded-xl border border-rule bg-paper p-6">
        <h2 className="text-2xl font-extrabold tracking-tight">{fill(w.thanks, { kennel: kennel.name })}</h2>
        <p className="mt-3 text-lg text-slate">{w.thanksNext}</p>
      </div>
    );
  }

  const group = "space-y-4 rounded-xl border border-rule bg-paper p-4";
  return (
    <form action={formAction} className="space-y-6">
      <fieldset className={group}>
        <legend className="px-1 text-lg font-bold">{w.whatTitle}</legend>
        <Field label={w.what}>
          <Select name="what" value={what} onChange={(e) => setWhat(e.target.value)}>
            {stays.map((k) => (
              <option key={k} value={k}>
                {w.kinds[k]}
              </option>
            ))}
            {kennel.services.map((s) => (
              <option key={s.id} value={s.id}>
                {fill(w.serviceOption, { name: s.name, minutes: s.minutes })}
              </option>
            ))}
          </Select>
        </Field>
        {appointment ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={w.day}>
              <Input name="start_date" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label={w.time}>
              <Input name="time" type="time" required />
            </Field>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={intake.dropOff}>
              <Input name="start_date" type="date" required value={start} onChange={(e) => setStart(e.target.value)} />
            </Field>
            <Field label={intake.pickUp}>
              <Input name="end_date" type="date" min={start || undefined} value={end} onChange={(e) => setEnd(e.target.value)} />
            </Field>
          </div>
        )}
        {kennel.delivers && !appointment ? (
          <>
            <label className="flex min-h-12 items-start gap-3">
              <input type="checkbox" name="pickup" checked={pickup} onChange={(e) => setPickup(e.target.checked)} className="mt-1 size-5 shrink-0" />
              <span>{w.pickup}</span>
            </label>
            {pickup ? (
              <>
                <Field label={w.pickupAddress} hint={intake.addressHint}>
                  <Input name="parent_address" required maxLength={200} autoComplete="street-address" />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label={intake.area}>
                    <Input name="parent_area" maxLength={120} autoComplete="address-level3" />
                  </Field>
                  <Field label={intake.pin}>
                    <Input name="parent_postal_code" inputMode="numeric" maxLength={10} autoComplete="postal-code" />
                  </Field>
                </div>
              </>
            ) : null}
          </>
        ) : null}
        <div className="rounded-lg bg-ground p-3" aria-live="polite">
          <p className="text-lg font-bold">
            {estimate === null
              ? w.estimateLater
              : "quote" in estimate
                ? w.estimateQuote
                : fill(estimate.from ? w.estimateFrom : what === "boarding" ? w.estimateNights : what === "daycare" ? w.estimateDays : w.estimate, {
                    amount: money(estimate.minor),
                    n: estimate.units,
                  })}
          </p>
          <p className="text-slate">{w.nothingCharged}</p>
        </div>
      </fieldset>

      <fieldset className={group}>
        <legend className="px-1 text-lg font-bold">{intake.yourPet}</legend>
        <Field label={intake.name}>
          <Input name="pet_name" required maxLength={80} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={intake.animal}>
            <Select name="species" defaultValue="dog">
              <option value="dog">{shared.species.dog}</option>
              <option value="cat">{shared.species.cat}</option>
              <option value="other">{shared.species.other}</option>
            </Select>
          </Field>
          <Field label={intake.breed}>
            <Input name="breed" maxLength={80} />
          </Field>
          <Field label={intake.sex}>
            <Select name="sex" defaultValue="unknown">
              <option value="male">{shared.sex.male}</option>
              <option value="female">{shared.sex.female}</option>
              <option value="unknown">{shared.sex.unknown}</option>
            </Select>
          </Field>
          <Field label={intake.neutered}>
            <Select name="is_neutered" defaultValue="">
              <option value="">{intake.notSure}</option>
              <option value="yes">{shared.yes}</option>
              <option value="no">{shared.no}</option>
            </Select>
          </Field>
          <Field label={intake.dateOfBirth}>
            <Input name="date_of_birth" type="date" />
          </Field>
        </div>
        <label className="flex min-h-12 items-start gap-3">
          <input type="checkbox" name="vaccinations_ok" className="mt-1 size-5 shrink-0" />
          <span>{w.vaccinationsOk}</span>
        </label>
      </fieldset>

      <fieldset className={group}>
        <legend className="px-1 text-lg font-bold">{intake.aboutYou}</legend>
        <Field label={intake.yourName}>
          <Input name="parent_name" required minLength={2} maxLength={120} autoComplete="name" />
        </Field>
        <Field label={intake.mobile} hint={intake.mobileHint}>
          <Input name="parent_phone" type="tel" inputMode="tel" required autoComplete="tel" />
        </Field>
        <Field label={intake.anythingElse}>
          <Textarea name="notes" maxLength={2000} />
        </Field>
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border-2 border-ink bg-paper p-4">
        <input type="checkbox" name="consent" required className="mt-1 size-5 shrink-0" />
        <span>{kennel.notice}</span>
      </label>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton pendingLabel={intake.sending} className="w-full">
        {w.send}
      </SubmitButton>
    </form>
  );
}
