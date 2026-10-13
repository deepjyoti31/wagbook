import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Input, Loading, PageTitle, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { PET_FLAGS } from "@/lib/pets";
import { createPet } from "../actions";

export const metadata: Metadata = { title: "Add a pet" };

export default function NewPetPage() {
  return (
    <>
      <PageTitle title="Add a pet" />
      <Suspense fallback={<Loading />}>
        <NewPetForm />
      </Suspense>
    </>
  );
}

async function NewPetForm() {
  await requireOrg();
  return (
    <ActionForm action={createPet}>
      <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        <legend className="px-1 text-lg font-bold">Parent</legend>
        <Field label="Mobile number" hint="If this parent has been here before, the pet is added to them.">
          <Input name="parentPhone" type="tel" inputMode="tel" autoComplete="off" required />
        </Field>
        <Field label="Name">
          <Input name="parentName" required maxLength={120} autoComplete="off" />
        </Field>
        <label className="flex items-start gap-3">
          <input type="checkbox" name="consent" className="mt-1 size-5" />
          <span>The parent agreed to us keeping these details.</span>
        </label>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        <legend className="px-1 text-lg font-bold">Pet</legend>
        <Field label="Name">
          <Input name="petName" required maxLength={80} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Animal">
            <Select name="species" defaultValue="dog">
              <option value="dog">Dog</option>
              <option value="cat">Cat</option>
              <option value="other">Other</option>
            </Select>
          </Field>
          <Field label="Breed">
            <Input name="breed" maxLength={80} />
          </Field>
          <Field label="Sex">
            <Select name="sex" defaultValue="unknown">
              <option value="unknown">Not known</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </Select>
          </Field>
          <Field label="Neutered or spayed">
            <Select name="isNeutered" defaultValue="">
              <option value="">Not known</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </Select>
          </Field>
          <Field label="Weight in kg">
            <Input name="weightKg" inputMode="decimal" />
          </Field>
        </div>
        <Field label="Food" hint="What, how much and when.">
          <Textarea name="foodNotes" />
        </Field>
        <Field label="Medical notes and medicines">
          <Textarea name="medicalNotes" />
        </Field>
        <Field label="Allergies">
          <Input name="allergies" />
        </Field>
        <Field label="Behaviour">
          <Textarea name="behaviourNotes" />
        </Field>
        <div>
          <p className="mb-2 font-semibold">Staff should know</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {PET_FLAGS.map((f) => (
              <label key={f} className="flex min-h-12 items-center gap-3 rounded-lg border border-rule px-3">
                <input type="checkbox" name={`flag_${f}`} className="size-5" />
                <span className="first-letter:uppercase">{f.replaceAll("_", " ")}</span>
              </label>
            ))}
          </div>
        </div>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <SubmitButton>Save pet</SubmitButton>
        <Link href="/app/dogs" className={buttonStyles.quiet}>
          Back to pets
        </Link>
      </div>
    </ActionForm>
  );
}
