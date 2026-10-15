import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Input, Loading, PageTitle, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { flagText } from "@/lib/bookings";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { PET_FLAGS } from "@/lib/pets";
import { createPet } from "../actions";

export const generateMetadata = () => appTitle((m) => m.newPet.title);

export default function NewPetPage() {
  return (
    <Suspense fallback={<Loading />}>
      <NewPetForm />
    </Suspense>
  );
}

async function NewPetForm() {
  await requireOrg();
  const { m } = await getAppI18n();
  const f = m.pet.fields;
  return (
    <>
      <PageTitle title={m.newPet.title} />
      <ActionForm action={createPet}>
        <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <legend className="px-1 text-lg font-bold">{m.newPet.parent}</legend>
          <Field label={m.newPet.mobile} hint={m.newPet.mobileHint}>
            <Input name="parentPhone" type="tel" inputMode="tel" autoComplete="off" required />
          </Field>
          <Field label={m.newPet.parentName}>
            <Input name="parentName" required maxLength={120} autoComplete="off" />
          </Field>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="consent" className="mt-1 size-5" />
            <span>{m.newPet.consent}</span>
          </label>
        </fieldset>

        <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <legend className="px-1 text-lg font-bold">{m.newPet.pet}</legend>
          <Field label={f.name}>
            <Input name="petName" required maxLength={80} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={f.animal}>
              <Select name="species" defaultValue="dog">
                <option value="dog">{m.labels.species.dog}</option>
                <option value="cat">{m.labels.species.cat}</option>
                <option value="other">{m.labels.species.other}</option>
              </Select>
            </Field>
            <Field label={f.breed}>
              <Input name="breed" maxLength={80} />
            </Field>
            <Field label={f.sex}>
              <Select name="sex" defaultValue="unknown">
                <option value="unknown">{m.labels.sex.unknown}</option>
                <option value="male">{m.labels.sex.male}</option>
                <option value="female">{m.labels.sex.female}</option>
              </Select>
            </Field>
            <Field label={f.neutered}>
              <Select name="isNeutered" defaultValue="">
                <option value="">{m.common.notKnown}</option>
                <option value="yes">{m.common.yes}</option>
                <option value="no">{m.common.no}</option>
              </Select>
            </Field>
            <Field label={f.weight}>
              <Input name="weightKg" inputMode="decimal" />
            </Field>
          </div>
          <Field label={f.food} hint={f.foodHint}>
            <Textarea name="foodNotes" />
          </Field>
          <Field label={m.newPet.medical}>
            <Textarea name="medicalNotes" />
          </Field>
          <Field label={f.allergies}>
            <Input name="allergies" />
          </Field>
          <Field label={f.behaviour}>
            <Textarea name="behaviourNotes" />
          </Field>
          <div>
            <p className="mb-2 font-semibold">{f.staffShouldKnow}</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {PET_FLAGS.map((flag) => (
                <label key={flag} className="flex min-h-12 items-center gap-3 rounded-lg border border-rule px-3">
                  <input type="checkbox" name={`flag_${flag}`} className="size-5" />
                  <span className="first-letter:uppercase">{flagText(m, flag)}</span>
                </label>
              ))}
            </div>
          </div>
        </fieldset>

        <div className="flex flex-wrap gap-3">
          <SubmitButton pendingLabel={m.common.saving}>{m.newPet.save}</SubmitButton>
          <Link href="/app/dogs" className={buttonStyles.quiet}>
            {m.newPet.back}
          </Link>
        </div>
      </ActionForm>
    </>
  );
}
