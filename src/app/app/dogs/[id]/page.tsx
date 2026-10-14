import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AddVaccinationForm, PetPhotoForm, VaccinationList } from "@/components/pet-panels";
import { PetAvatar } from "@/components/pet-avatar";
import { Badge, buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { flagText, STATUS_LABEL, stayText } from "@/lib/bookings";
import { formatPhone, todayIn } from "@/lib/core";
import { signedUrls } from "@/lib/media";
import { INCIDENT_CATEGORY_LABEL, PET_FLAGS, SEVERITY_SHORT } from "@/lib/pets";
import { createClient } from "@/lib/supabase/server";
import { updateIncident, updatePet } from "../actions";

export const metadata: Metadata = { title: "Pet" };

export default function PetPage({ params, searchParams }: PageProps<"/app/dogs/[id]">) {
  return (
    <Suspense fallback={<Loading label="Loading the pet" />}>
      <Pet params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const DONE: Record<string, string> = { incident: "Incident written down.", told: "Marked as told.", resolved: "Marked as dealt with." };

async function Pet({ params, searchParams }: Pick<PageProps<"/app/dogs/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const doneKey = (await searchParams).done;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org } = await requireOrg();
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  const res = await supabase
    .from("pets")
    .select(
      "id, name, species, breed, sex, is_neutered, date_of_birth, weight_kg, color, microchip, photo_path, food_notes, medical_notes, allergies, behaviour_notes, flags, vet_name, vet_phone, clients(id, full_name, phone)",
    )
    .eq("org_id", org.id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (res.error) throw new Error("Could not load the pet.");
  if (!res.data) notFound();
  const pet = res.data;

  const [stays, incidents, vaccinations] = await Promise.all([
    supabase.from("bookings").select("id, kind, status, start_date, end_date, kennels(name)").eq("org_id", org.id).eq("pet_id", id).order("start_date", { ascending: false }).limit(50),
    supabase
      .from("incidents")
      .select("id, occurred_at, category, severity, description, action_taken, vet_visited, parent_notified_at, resolved_at")
      .eq("org_id", org.id)
      .eq("pet_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase.from("vaccinations").select("id, vaccine, given_on, valid_until, certificate_path").eq("org_id", org.id).eq("pet_id", id).order("vaccine"),
  ]);
  if (stays.error || incidents.error || vaccinations.error) throw new Error("Could not load the pet.");

  const [photo, certificates] = await Promise.all([
    signedUrls(supabase, [pet.photo_path], { small: true }),
    signedUrls(supabase, vaccinations.data.map((v) => v.certificate_path)),
  ]);
  const when = new Intl.DateTimeFormat(org.locale, { timeZone: org.time_zone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <div className="mb-3">
        <PetAvatar name={pet.name} url={pet.photo_path ? photo.get(pet.photo_path) : null} size="lg" />
      </div>
      <PageTitle title={pet.name}>
        <Link href={`/app/bookings/new?pet=${pet.id}`} className={buttonStyles.primary}>
          Book a stay
        </Link>
      </PageTitle>
      <div className="mb-5 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          {[pet.breed, pet.species !== "dog" ? pet.species : null, pet.weight_kg ? `${pet.weight_kg} kg` : null].filter(Boolean).join(", ")}
          {pet.flags.map((f) => (
            <Badge key={f} tone="alert">
              {flagText(f)}
            </Badge>
          ))}
        </p>
        {pet.clients ? (
          <p className="text-slate">
            <Link href={`/app/clients/${pet.clients.id}`} className="font-semibold text-ink underline underline-offset-4">
              {pet.clients.full_name}
            </Link>
            ,{" "}
            <a href={`tel:${pet.clients.phone}`} className="underline underline-offset-4">
              {formatPhone(pet.clients.phone)}
            </a>
          </p>
        ) : null}
      </div>

      {typeof doneKey === "string" && DONE[doneKey] ? <Notice tone="ok">{DONE[doneKey]}</Notice> : null}

      <Section title="Incidents" count={incidents.data.length}>
        {incidents.data.length === 0 ? (
          <Empty>Nothing out of the ordinary has been written down.</Empty>
        ) : (
          <ul className="space-y-3">
            {incidents.data.map((i) => (
              <li key={i.id} className={`rounded-xl border bg-paper p-4 ${i.severity === "high" && !i.resolved_at ? "border-alert" : "border-rule"}`}>
                <p className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate">{when.format(new Date(i.occurred_at))}</span>
                  <Badge tone={i.severity === "low" ? "neutral" : i.severity === "medium" ? "attention" : "alert"}>{SEVERITY_SHORT[i.severity]}</Badge>
                  <Badge>{INCIDENT_CATEGORY_LABEL[i.category as keyof typeof INCIDENT_CATEGORY_LABEL] ?? i.category}</Badge>
                  {i.vet_visited ? <Badge>Vet seen</Badge> : null}
                  {i.parent_notified_at ? <Badge tone="good">Parent told</Badge> : <Badge tone="attention">Parent not told</Badge>}
                  {i.resolved_at ? <Badge tone="good">Dealt with</Badge> : null}
                </p>
                <p className="whitespace-pre-line">{i.description}</p>
                {i.action_taken ? <p className="mt-1 whitespace-pre-line text-slate">What we did: {i.action_taken}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {!i.parent_notified_at ? (
                    <ActionForm action={updateIncident} className="contents">
                      <input type="hidden" name="incidentId" value={i.id} />
                      <input type="hidden" name="what" value="told" />
                      <SubmitButton variant="secondary" pendingLabel="Saving">
                        Parent has been told
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                  {!i.resolved_at ? (
                    <ActionForm action={updateIncident} className="contents">
                      <input type="hidden" name="incidentId" value={i.id} />
                      <input type="hidden" name="what" value="resolved" />
                      <SubmitButton variant="quiet" pendingLabel="Saving">
                        Dealt with
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/app/dogs/${pet.id}/incident`} className={`${buttonStyles.secondary} mt-3`}>
          Write down an incident
        </Link>
      </Section>

      <Section title="Vaccinations" count={vaccinations.data.length}>
        <div className="space-y-3 rounded-xl border border-rule bg-paper p-4">
          <VaccinationList records={vaccinations.data} today={today} certificates={certificates} />
          <AddVaccinationForm petId={pet.id} />
        </div>
      </Section>

      <Section title="Stays" count={stays.data.length}>
        {stays.data.length === 0 ? (
          <Empty>No stays yet.</Empty>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {stays.data.map((s) => (
              <li key={s.id}>
                <Link href={`/app/bookings/${s.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                  <span className="flex-1">{stayText(s.kind, s.start_date, s.end_date)}</span>
                  {s.kennels ? <span className="door-tag">{s.kennels.name}</span> : null}
                  <Badge tone={s.status === "checked_in" ? "good" : "neutral"}>{STATUS_LABEL[s.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Photo">
        <PetPhotoForm petId={pet.id} hasPhoto={Boolean(pet.photo_path)} />
      </Section>

      <Section title="Details">
        <ActionForm action={updatePet} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <input type="hidden" name="petId" value={pet.id} />
          <Field label="Name">
            <Input name="name" required maxLength={80} defaultValue={pet.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Animal">
              <Select name="species" defaultValue={pet.species}>
                <option value="dog">Dog</option>
                <option value="cat">Cat</option>
                <option value="other">Other</option>
              </Select>
            </Field>
            <Field label="Breed">
              <Input name="breed" maxLength={80} defaultValue={pet.breed ?? ""} />
            </Field>
            <Field label="Sex">
              <Select name="sex" defaultValue={pet.sex}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="unknown">Not known</option>
              </Select>
            </Field>
            <Field label="Neutered or spayed">
              <Select name="isNeutered" defaultValue={pet.is_neutered === null ? "" : pet.is_neutered ? "yes" : "no"}>
                <option value="">Not known</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </Select>
            </Field>
            <Field label="Date of birth">
              <Input name="dateOfBirth" type="date" defaultValue={pet.date_of_birth ?? ""} />
            </Field>
            <Field label="Weight in kg">
              <Input name="weightKg" inputMode="decimal" defaultValue={pet.weight_kg === null ? "" : String(pet.weight_kg)} />
            </Field>
            <Field label="Colour">
              <Input name="color" maxLength={80} defaultValue={pet.color ?? ""} />
            </Field>
            <Field label="Microchip">
              <Input name="microchip" maxLength={40} defaultValue={pet.microchip ?? ""} />
            </Field>
          </div>
          <Field label="Food" hint="What, how much and when.">
            <Textarea name="foodNotes" maxLength={2000} defaultValue={pet.food_notes ?? ""} />
          </Field>
          <Field label="Health and medicines">
            <Textarea name="medicalNotes" maxLength={2000} defaultValue={pet.medical_notes ?? ""} />
          </Field>
          <Field label="Allergies">
            <Input name="allergies" maxLength={2000} defaultValue={pet.allergies ?? ""} />
          </Field>
          <Field label="Behaviour">
            <Textarea name="behaviourNotes" maxLength={2000} defaultValue={pet.behaviour_notes ?? ""} />
          </Field>
          <fieldset>
            <legend className="mb-1 font-semibold">Staff should know</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {PET_FLAGS.map((f) => (
                <label key={f} className="flex min-h-12 items-center gap-3">
                  <input type="checkbox" name={`flag_${f}`} defaultChecked={pet.flags.includes(f)} className="size-5" />
                  <span>{flagText(f)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Vet">
              <Input name="vetName" maxLength={120} defaultValue={pet.vet_name ?? ""} />
            </Field>
            <Field label="Vet's phone">
              <Input name="vetPhone" type="tel" maxLength={40} defaultValue={pet.vet_phone ?? ""} />
            </Field>
          </div>
          <SubmitButton>Save details</SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
