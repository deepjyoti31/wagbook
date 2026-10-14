import { ActionForm, SubmitButton } from "@/components/action-form";
import { PhotoInput } from "@/components/photo-input";
import { Badge, Field, Input, Notice } from "@/components/ui";
import { addVaccination, setPetPhoto } from "@/app/app/media/actions";
import { formatDate, vaccinationStatus, type VaccinationWarning } from "@/lib/core";
import { VACCINATION_STATUS_LABEL, vaccinationWarningText } from "@/lib/pets";

/** Pieces about one pet, shared by the pet page and the booking page. Server components. */

export function PetPhotoForm({ petId, hasPhoto }: { petId: string; hasPhoto: boolean }) {
  return (
    <ActionForm action={setPetPhoto} className="space-y-3 rounded-xl border border-rule bg-paper p-4">
      <input type="hidden" name="petId" value={petId} />
      <PhotoInput name="photo" label={hasPhoto ? "Change the photo" : "Add a photo, so the team knows which dog is which"} />
      <SubmitButton variant="secondary" pendingLabel="Saving">
        Save photo
      </SubmitButton>
    </ActionForm>
  );
}

export interface VaccinationRecord {
  id: string;
  vaccine: string;
  given_on?: string | null;
  valid_until: string | null;
  certificate_path: string | null;
}

/** Vaccinations with their status today, and a link to each certificate. */
export function VaccinationList({ records, today, certificates }: { records: VaccinationRecord[]; today: string; certificates: Map<string, string> }) {
  if (records.length === 0) return <p className="text-slate">None on record.</p>;
  return (
    <ul className="space-y-2">
      {records.map((v) => {
        const status = vaccinationStatus(v.valid_until, today);
        return (
          <li key={v.id} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{v.vaccine.replaceAll("_", " ")}</span>
            <Badge tone={status === "expired" ? "alert" : status === "valid" ? "good" : "attention"}>
              {VACCINATION_STATUS_LABEL[status]}
              {v.valid_until ? `, ${formatDate(v.valid_until)}` : ""}
            </Badge>
            {v.certificate_path && certificates.get(v.certificate_path) ? (
              <a href={certificates.get(v.certificate_path)} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center underline underline-offset-4">
                Certificate
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function AddVaccinationForm({ petId }: { petId: string }) {
  return (
    <details>
      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">Add a vaccination</summary>
      <ActionForm action={addVaccination} className="mt-2 space-y-3">
        <input type="hidden" name="petId" value={petId} />
        <Field label="Vaccine">
          <Input name="vaccine" required maxLength={60} placeholder="rabies" />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Given on">
            <Input name="givenOn" type="date" />
          </Field>
          <Field label="Valid until">
            <Input name="validUntil" type="date" />
          </Field>
        </div>
        <PhotoInput name="certificate" label="Certificate, a photo or a PDF" accept="image/*,application/pdf" />
        <SubmitButton variant="secondary" pendingLabel="Saving">
          Save vaccination
        </SubmitButton>
      </ActionForm>
    </details>
  );
}

/** What staff should check about vaccinations before or at check-in. Nothing when all is well. */
export function VaccinationWarnings({ warnings }: { warnings: VaccinationWarning[] }) {
  if (warnings.length === 0) return null;
  return (
    <Notice tone="info">
      {warnings.length === 1 ? "Vaccinations: " : "Vaccinations to check: "}
      {warnings.map(vaccinationWarningText).join(" ")}
    </Notice>
  );
}
