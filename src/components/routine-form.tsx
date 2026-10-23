import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { addRoutine } from "@/app/app/care/actions";
import { CARE_KINDS } from "@/lib/care";
import { getAppI18n } from "@/lib/i18n-server";

/**
 * Add a routine: one pet's own when a pet is given, otherwise a house routine for every pet.
 * A server component that finds the reader's words itself, so it is drawn inside a page's Suspense.
 */
export async function RoutineForm({ petId }: { petId?: string }) {
  const { m } = await getAppI18n();
  const r = m.routines;
  return (
    <ActionForm action={addRoutine} className="mt-4 space-y-4 rounded-xl border border-rule bg-paper p-4">
      {petId ? <input type="hidden" name="petId" value={petId} /> : null}
      <p className="font-bold">{petId ? r.addForPet : r.addHouse}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={r.what}>
          <Input name="label" required maxLength={80} placeholder={petId ? r.examplePet : r.exampleHouse} />
        </Field>
        <Field label={r.kind}>
          <Select name="kind" defaultValue={petId ? "medication" : "meal"}>
            {CARE_KINDS.map((k) => (
              <option key={k} value={k}>
                {m.labels.careKind[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={r.time}>
          <Input name="dueTime" type="time" required />
        </Field>
      </div>
      <Field label={r.how} hint={r.howHint}>
        <Input name="details" maxLength={500} />
      </Field>
      <label className="flex min-h-12 items-start gap-3">
        <input type="checkbox" name="needsPhoto" className="mt-1 size-5 shrink-0" />
        <span>
          <span className="block font-semibold">{m.proof.needsPhoto}</span>
          <span className="block text-sm text-slate">{m.proof.needsPhotoHint}</span>
        </span>
      </label>
      <SubmitButton variant="secondary" pendingLabel={m.common.adding}>
        {r.add}
      </SubmitButton>
    </ActionForm>
  );
}
