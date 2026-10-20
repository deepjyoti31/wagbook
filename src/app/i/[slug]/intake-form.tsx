"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/action-form";
import { PhotoInput } from "@/components/photo-input";
import { buttonStyles, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import type { Messages } from "@/messages";

const MAX_PETS = 6;

/** Shared words the form reuses, as they stand in the message file. */
export interface IntakeSharedWords {
  species: Messages["labels"]["species"];
  sex: Messages["labels"]["sex"];
  yes: string;
  no: string;
  photos: Messages["photos"];
}

/**
 * The form a pet parent fills in. One page, no account, no app.
 * Pets are numbered by a stable key so removing one in the middle does not
 * scramble what was typed into the others.
 * The words come from the page, in the kennel's language for parents.
 */
export function IntakeForm({
  action,
  kennelName,
  notice,
  words: w,
  shared,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  kennelName: string;
  notice: string;
  words: Messages["intakeForm"];
  shared: IntakeSharedWords;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const [pets, setPets] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);

  if (state.ok) {
    return (
      <div className="rounded-xl border border-rule bg-paper p-6">
        <h2 className="text-2xl font-extrabold tracking-tight">{fill(w.thanks, { kennel: kennelName })}</h2>
        <p className="mt-3 text-lg text-slate">{w.thanksNext}</p>
        {/* Anything but "sent" is the sentence about a certificate that did not go. */}
        {state.ok === "sent" ? null : (
          <div className="mt-4">
            <Notice tone="error">{state.ok}</Notice>
          </div>
        )}
      </div>
    );
  }

  const group = "space-y-4 rounded-xl border border-rule bg-paper p-4";

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className={group}>
        <legend className="px-1 text-lg font-bold">{w.aboutYou}</legend>
        <Field label={w.yourName}>
          <Input name="parent_name" required minLength={2} maxLength={120} autoComplete="name" />
        </Field>
        <Field label={w.mobile} hint={w.mobileHint}>
          <Input name="parent_phone" type="tel" inputMode="tel" required autoComplete="tel" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={w.email}>
            <Input name="parent_email" type="email" autoComplete="email" />
          </Field>
          <Field label={w.city}>
            <Input name="parent_city" autoComplete="address-level2" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={w.emergency} hint={w.emergencyHint}>
            <Input name="emergency_name" />
          </Field>
          <Field label={w.emergencyPhone}>
            <Input name="emergency_phone" type="tel" inputMode="tel" />
          </Field>
        </div>
      </fieldset>

      {pets.map((key, index) => (
        <fieldset key={key} className={group}>
          <legend className="px-1 text-lg font-bold">{pets.length > 1 ? fill(w.petNumber, { n: index + 1 }) : w.yourPet}</legend>
          <Field label={w.name}>
            <Input name={`pets.${key}.name`} required maxLength={80} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={w.animal}>
              <Select name={`pets.${key}.species`} defaultValue="dog">
                <option value="dog">{shared.species.dog}</option>
                <option value="cat">{shared.species.cat}</option>
                <option value="other">{shared.species.other}</option>
              </Select>
            </Field>
            <Field label={w.breed}>
              <Input name={`pets.${key}.breed`} maxLength={80} />
            </Field>
            <Field label={w.sex}>
              <Select name={`pets.${key}.sex`} defaultValue="unknown">
                <option value="unknown">{w.sexNotSaid}</option>
                <option value="male">{shared.sex.male}</option>
                <option value="female">{shared.sex.female}</option>
              </Select>
            </Field>
            <Field label={w.neutered}>
              <Select name={`pets.${key}.is_neutered`} defaultValue="">
                <option value="">{w.notSure}</option>
                <option value="yes">{shared.yes}</option>
                <option value="no">{shared.no}</option>
              </Select>
            </Field>
            <Field label={w.dateOfBirth}>
              <Input name={`pets.${key}.date_of_birth`} type="date" />
            </Field>
            <Field label={w.weight}>
              <Input name={`pets.${key}.weight_kg`} inputMode="decimal" />
            </Field>
          </div>
          <Field label={w.food} hint={w.foodHint}>
            <Textarea name={`pets.${key}.food_notes`} maxLength={2000} />
          </Field>
          <Field label={w.health} hint={w.healthHint}>
            <Textarea name={`pets.${key}.medical_notes`} maxLength={2000} />
          </Field>
          <Field label={w.allergies}>
            <Input name={`pets.${key}.allergies`} maxLength={200} />
          </Field>
          <Field label={w.behaviour} hint={w.behaviourHint}>
            <Textarea name={`pets.${key}.behaviour_notes`} maxLength={2000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={w.vaccine} hint={w.vaccineHint}>
              <Input name={`pets.${key}.vaccine`} maxLength={60} />
            </Field>
            <Field label={w.validUntil}>
              <Input name={`pets.${key}.vaccine_valid_until`} type="date" />
            </Field>
            <div className="sm:col-span-2">
              <PhotoInput name={`pets.${key}.certificate`} label={w.certificate} accept="image/*,application/pdf" words={shared.photos} />
              <p className="mt-1 text-sm text-slate">{w.certificateHint}</p>
            </div>
            <details className="sm:col-span-2">
              <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{w.anotherVaccine}</summary>
              <div className="mt-2 grid gap-4 sm:grid-cols-2">
                <Field label={w.secondVaccine}>
                  <Input name={`pets.${key}.vaccine2`} maxLength={60} />
                </Field>
                <Field label={w.validUntil}>
                  <Input name={`pets.${key}.vaccine2_valid_until`} type="date" />
                </Field>
                <div className="sm:col-span-2">
                  <PhotoInput name={`pets.${key}.certificate2`} label={w.certificate} accept="image/*,application/pdf" words={shared.photos} />
                </div>
              </div>
            </details>
            <Field label={w.vet}>
              <Input name={`pets.${key}.vet_name`} maxLength={200} />
            </Field>
            <Field label={w.vetPhone}>
              <Input name={`pets.${key}.vet_phone`} type="tel" inputMode="tel" />
            </Field>
          </div>
          {pets.length > 1 ? (
            <button type="button" className={buttonStyles.quiet} onClick={() => setPets(pets.filter((k) => k !== key))}>
              {w.removePet}
            </button>
          ) : null}
        </fieldset>
      ))}

      {pets.length < MAX_PETS && nextKey < MAX_PETS ? (
        <button
          type="button"
          className={buttonStyles.secondary}
          onClick={() => {
            setPets([...pets, nextKey]);
            setNextKey(nextKey + 1);
          }}
        >
          {w.addPet}
        </button>
      ) : null}

      <fieldset className={group}>
        <legend className="px-1 text-lg font-bold">{w.stay}</legend>
        <Field label={w.need}>
          <Select name="kind" defaultValue="boarding">
            <option value="boarding">{w.boarding}</option>
            <option value="daycare">{w.daycare}</option>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={w.dropOff}>
            <Input name="start_date" type="date" />
          </Field>
          <Field label={w.pickUp}>
            <Input name="end_date" type="date" />
          </Field>
        </div>
        <Field label={w.anythingElse}>
          <Textarea name="stay_notes" maxLength={2000} />
        </Field>
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border-2 border-ink bg-paper p-4">
        <input type="checkbox" name="consent" required className="mt-1 size-5 shrink-0" />
        <span>{notice}</span>
      </label>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton pendingLabel={w.sending} className="w-full">
        {fill(w.send, { kennel: kennelName })}
      </SubmitButton>
    </form>
  );
}
