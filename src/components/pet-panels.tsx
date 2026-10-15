import { ActionForm, SubmitButton } from "@/components/action-form";
import { PhotoInput } from "@/components/photo-input";
import { Badge, Field, Input, Notice } from "@/components/ui";
import { addVaccination, setPetPhoto } from "@/app/app/media/actions";
import { formatDate, vaccinationStatus, type VaccinationWarning } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { vaccinationWarningText } from "@/lib/pets";
import type { Messages } from "@/messages";

/**
 * Pieces about one pet, shared by the pet page and the booking page. Server
 * components. Each takes the reader's words as `t` (from getAppI18n()).
 */

type Words = { m: Messages; locale: string };

export function PetPhotoForm({ t, petId, hasPhoto }: { t: Words; petId: string; hasPhoto: boolean }) {
  const { m } = t;
  return (
    <ActionForm action={setPetPhoto} className="space-y-3 rounded-xl border border-rule bg-paper p-4">
      <input type="hidden" name="petId" value={petId} />
      <PhotoInput name="photo" label={hasPhoto ? m.media.photo.change : m.media.photo.add} words={m.photos} />
      <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
        {m.media.photo.save}
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
export function VaccinationList({ t, records, today, certificates }: { t: Words; records: VaccinationRecord[]; today: string; certificates: Map<string, string> }) {
  const { m } = t;
  const v = m.media.vaccination;
  if (records.length === 0) return <p className="text-slate">{v.none}</p>;
  return (
    <ul className="space-y-2">
      {records.map((r) => {
        const status = vaccinationStatus(r.valid_until, today);
        const label = m.labels.vaccinationStatus[status];
        return (
          <li key={r.id} className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{r.vaccine.replaceAll("_", " ")}</span>
            <Badge tone={status === "expired" ? "alert" : status === "valid" ? "good" : "attention"}>
              {r.valid_until ? fill(v.statusOn, { status: label, date: formatDate(r.valid_until, t.locale) }) : label}
            </Badge>
            {r.certificate_path && certificates.get(r.certificate_path) ? (
              <a href={certificates.get(r.certificate_path)} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center underline underline-offset-4">
                {v.certificate}
              </a>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

export function AddVaccinationForm({ t, petId }: { t: Words; petId: string }) {
  const { m } = t;
  const v = m.media.vaccination;
  return (
    <details>
      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{v.add}</summary>
      <ActionForm action={addVaccination} className="mt-2 space-y-3">
        <input type="hidden" name="petId" value={petId} />
        <Field label={v.vaccine}>
          <Input name="vaccine" required maxLength={60} placeholder={v.vaccineExample} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={v.givenOn}>
            <Input name="givenOn" type="date" />
          </Field>
          <Field label={v.validUntil}>
            <Input name="validUntil" type="date" />
          </Field>
        </div>
        <PhotoInput name="certificate" label={v.certificateInput} accept="image/*,application/pdf" words={m.photos} />
        <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
          {v.save}
        </SubmitButton>
      </ActionForm>
    </details>
  );
}

/** What staff should check about vaccinations before or at check-in. Nothing when all is well. */
export function VaccinationWarnings({ t, warnings }: { t: Words; warnings: VaccinationWarning[] }) {
  if (warnings.length === 0) return null;
  const { m } = t;
  return (
    <Notice tone="info">
      {fill(warnings.length === 1 ? m.media.warningOne : m.media.warningMany, { warnings: warnings.map((w) => vaccinationWarningText(t, w)).join(" ") })}
    </Notice>
  );
}
