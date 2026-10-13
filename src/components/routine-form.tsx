import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { addRoutine } from "@/app/app/care/actions";
import { CARE_KIND_LABEL, CARE_KINDS } from "@/lib/care";

/** Add a routine: one pet's own when a pet is given, otherwise a house routine for every pet. */
export function RoutineForm({ petId }: { petId?: string }) {
  return (
    <ActionForm action={addRoutine} className="mt-4 space-y-4 rounded-xl border border-rule bg-paper p-4">
      {petId ? <input type="hidden" name="petId" value={petId} /> : null}
      <p className="font-bold">{petId ? "Add a routine for this pet" : "Add a house routine"}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="What">
          <Input name="label" required maxLength={80} placeholder={petId ? "Tablet" : "Breakfast"} />
        </Field>
        <Field label="Kind">
          <Select name="kind" defaultValue={petId ? "medication" : "meal"}>
            {CARE_KINDS.map((k) => (
              <option key={k} value={k}>
                {CARE_KIND_LABEL[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Time">
          <Input name="dueTime" type="time" required />
        </Field>
      </div>
      <Field label="How" hint="Like: 1 tablet with food, or 200 g kibble with warm water.">
        <Input name="details" maxLength={500} />
      </Field>
      <SubmitButton variant="secondary" pendingLabel="Adding">
        Add routine
      </SubmitButton>
    </ActionForm>
  );
}
