"use client";

import { useActionState, useState } from "react";
import { SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { EMPTY_FORM_STATE, type FormState } from "@/lib/forms";

const MAX_PETS = 6;

/**
 * The form a pet parent fills in. One page, no account, no app.
 * Pets are numbered by a stable key so removing one in the middle does not
 * scramble what was typed into the others.
 */
export function IntakeForm({
  action,
  kennelName,
  notice,
}: {
  action: (state: FormState, form: FormData) => Promise<FormState>;
  kennelName: string;
  notice: string;
}) {
  const [state, formAction] = useActionState(action, EMPTY_FORM_STATE);
  const [pets, setPets] = useState<number[]>([0]);
  const [nextKey, setNextKey] = useState(1);

  if (state.ok) {
    return (
      <div className="rounded-xl border border-rule bg-paper p-6">
        <h2 className="text-2xl font-extrabold tracking-tight">Thank you. {kennelName} has your details.</h2>
        <p className="mt-3 text-lg text-slate">They will check the form and get back to you to confirm the stay. You can close this page.</p>
      </div>
    );
  }

  const group = "space-y-4 rounded-xl border border-rule bg-paper p-4";

  return (
    <form action={formAction} className="space-y-6">
      <fieldset className={group}>
        <legend className="px-1 text-lg font-bold">About you</legend>
        <Field label="Your name">
          <Input name="parent_name" required minLength={2} maxLength={120} autoComplete="name" />
        </Field>
        <Field label="Mobile number" hint="The number you use for WhatsApp.">
          <Input name="parent_phone" type="tel" inputMode="tel" required autoComplete="tel" />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Email (optional)">
            <Input name="parent_email" type="email" autoComplete="email" />
          </Field>
          <Field label="City (optional)">
            <Input name="parent_city" autoComplete="address-level2" />
          </Field>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Someone else we can call" hint="If we cannot reach you during the stay.">
            <Input name="emergency_name" />
          </Field>
          <Field label="Their number">
            <Input name="emergency_phone" type="tel" inputMode="tel" />
          </Field>
        </div>
      </fieldset>

      {pets.map((key, index) => (
        <fieldset key={key} className={group}>
          <legend className="px-1 text-lg font-bold">{pets.length > 1 ? `Pet ${index + 1}` : "Your pet"}</legend>
          <Field label="Name">
            <Input name={`pets.${key}.name`} required maxLength={80} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Animal">
              <Select name={`pets.${key}.species`} defaultValue="dog">
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Breed">
              <Input name={`pets.${key}.breed`} maxLength={80} />
            </Field>
            <Field label="Sex">
              <Select name={`pets.${key}.sex`} defaultValue="unknown">
                <option value="unknown">Prefer not to say</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
              </Select>
            </Field>
            <Field label="Neutered or spayed">
              <Select name={`pets.${key}.is_neutered`} defaultValue="">
                <option value="">Not sure</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
            <Field label="Date of birth (roughly)">
              <Input name={`pets.${key}.date_of_birth`} type="date" />
            </Field>
            <Field label="Weight in kg">
              <Input name={`pets.${key}.weight_kg`} inputMode="decimal" />
            </Field>
          </div>
          <Field label="Food" hint="What they eat, how much, and at what times.">
            <Textarea name={`pets.${key}.food_notes`} maxLength={2000} />
          </Field>
          <Field label="Health and medicines" hint="Any condition we should know about, and any medicine with its dose and timing.">
            <Textarea name={`pets.${key}.medical_notes`} maxLength={2000} />
          </Field>
          <Field label="Allergies">
            <Input name={`pets.${key}.allergies`} maxLength={200} />
          </Field>
          <Field label="Behaviour" hint="With other dogs, with strangers, on the leash. Anything that scares or upsets them.">
            <Textarea name={`pets.${key}.behaviour_notes`} maxLength={2000} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Latest vaccination" hint="For example, rabies or the yearly combined shot.">
              <Input name={`pets.${key}.vaccine`} maxLength={60} />
            </Field>
            <Field label="Valid until">
              <Input name={`pets.${key}.vaccine_valid_until`} type="date" />
            </Field>
            <Field label="Your vet">
              <Input name={`pets.${key}.vet_name`} maxLength={200} />
            </Field>
            <Field label="Vet's phone">
              <Input name={`pets.${key}.vet_phone`} type="tel" inputMode="tel" />
            </Field>
          </div>
          {pets.length > 1 ? (
            <button type="button" className={buttonStyles.quiet} onClick={() => setPets(pets.filter((k) => k !== key))}>
              Remove this pet
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
          Add another pet
        </button>
      ) : null}

      <fieldset className={group}>
        <legend className="px-1 text-lg font-bold">The stay</legend>
        <Field label="What do you need?">
          <Select name="kind" defaultValue="boarding">
            <option value="boarding">Boarding (overnight)</option>
            <option value="daycare">Day boarding (no night)</option>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Drop-off date">
            <Input name="start_date" type="date" />
          </Field>
          <Field label="Pick-up date">
            <Input name="end_date" type="date" />
          </Field>
        </div>
        <Field label="Anything else we should know?">
          <Textarea name="stay_notes" maxLength={2000} />
        </Field>
      </fieldset>

      <label className="flex items-start gap-3 rounded-xl border-2 border-ink bg-paper p-4">
        <input type="checkbox" name="consent" required className="mt-1 size-5 shrink-0" />
        <span>{notice}</span>
      </label>

      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <SubmitButton pendingLabel="Sending" className="w-full">
        Send to {kennelName}
      </SubmitButton>
    </form>
  );
}
