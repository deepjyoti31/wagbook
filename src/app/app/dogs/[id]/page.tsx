import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { HidePanel } from "@/components/hide-panel";
import { AddVaccinationForm, PetPhotoForm, VaccinationList } from "@/components/pet-panels";
import { PetAvatar } from "@/components/pet-avatar";
import { Badge, buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { flagText, stayText } from "@/lib/bookings";
import { formatDate, formatKg, formatPhone, todayIn, weightChange } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { signedUrls } from "@/lib/media";
import { incidentCategoryText, PET_FLAGS } from "@/lib/pets";
import { createClient } from "@/lib/supabase/server";
import { addWeight, removeWeight, setPetHidden, setTargetWeight, updateIncident, updatePet } from "../actions";

export const generateMetadata = () => appTitle((m) => m.pet.title);

export default function PetPage({ params, searchParams }: PageProps<"/app/dogs/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Pet params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Pet({ params, searchParams }: Pick<PageProps<"/app/dogs/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const doneKey = (await searchParams).done;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage, canDelete } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const done = typeof doneKey === "string" && Object.hasOwn(m.pet.done, doneKey) ? m.pet.done[doneKey as keyof typeof m.pet.done] : null;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  const res = await supabase
    .from("pets")
    .select(
      "id, name, species, breed, sex, is_neutered, date_of_birth, weight_g, target_weight_g, color, microchip, photo_path, food_notes, medical_notes, allergies, behaviour_notes, flags, vet_name, vet_phone, deleted_at, clients(id, full_name, phone, deleted_at, erased_at)",
    )
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (res.error) throw new Error("Could not load the pet.");
  // A hidden pet still has its page, reached from its past stays; an erased one does not.
  if (!res.data || res.data.clients?.erased_at) notFound();
  const pet = res.data;
  const hidden = pet.deleted_at !== null;

  const [stays, incidents, vaccinations, weights] = await Promise.all([
    supabase.from("bookings").select("id, kind, status, start_date, end_date, kennels(name)").eq("org_id", org.id).eq("pet_id", id).order("start_date", { ascending: false }).limit(50),
    supabase
      .from("incidents")
      .select("id, occurred_at, category, severity, description, action_taken, vet_visited, parent_notified_at, resolved_at")
      .eq("org_id", org.id)
      .eq("pet_id", id)
      .order("occurred_at", { ascending: false })
      .limit(50),
    supabase.from("vaccinations").select("id, vaccine, given_on, valid_until, certificate_path").eq("org_id", org.id).eq("pet_id", id).order("vaccine"),
    supabase
      .from("pet_weights")
      .select("id, weighed_on, weight_g, body_condition, notes")
      .eq("org_id", org.id)
      .eq("pet_id", id)
      .order("weighed_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(24),
  ]);
  if (stays.error || incidents.error || vaccinations.error || weights.error) throw new Error("Could not load the pet.");

  const [photo, certificates] = await Promise.all([
    signedUrls(supabase, [pet.photo_path], { small: true }),
    signedUrls(supabase, vaccinations.data.map((v) => v.certificate_path)),
  ]);
  const f = m.pet.fields;
  const hideWords = { title: m.hiding.title, about: m.hiding.petAbout, hide: m.hiding.hidePet, hidden: m.hiding.hiddenPet, show: m.hiding.show, saving: m.common.saving };
  const when = new Intl.DateTimeFormat(t.locale, { timeZone: org.time_zone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <div className="mb-3">
        <PetAvatar name={pet.name} url={pet.photo_path ? photo.get(pet.photo_path) : null} size="lg" />
      </div>
      <PageTitle title={pet.name}>
        {hidden ? null : (
          <Link href={`/app/bookings/new?pet=${pet.id}`} className={buttonStyles.primary}>
            {m.pet.bookStay}
          </Link>
        )}
      </PageTitle>
      <div className="mb-5 space-y-1">
        <p className="flex flex-wrap items-center gap-2">
          {[pet.breed, pet.species !== "dog" ? ((m.pet.speciesInLine as Record<string, string>)[pet.species] ?? pet.species) : null, pet.weight_g ? fill(m.pet.weight, { kg: formatKg(pet.weight_g, t.locale) }) : null].filter(Boolean).join(", ")}
          {pet.flags.map((f) => (
            <Badge key={f} tone="alert">
              {flagText(m, f)}
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

      {done ? <Notice tone="ok">{done}</Notice> : null}
      {doneKey === "hidden" ? <Notice tone="ok">{m.hiding.doneHidden}</Notice> : null}
      {doneKey === "shown" && !hidden ? <Notice tone="ok">{m.hiding.doneShown}</Notice> : null}
      {hidden ? (
        <HidePanel
          action={setPetHidden}
          field="petId"
          id={pet.id}
          hidden
          canManage={canManage}
          words={{ ...hideWords, hidden: m.hiding.hiddenPet }}
          blocked={pet.clients?.deleted_at ? m.hiding.withParent : null}
        />
      ) : null}

      <Section title={m.pet.incidents} count={incidents.data.length}>
        {incidents.data.length === 0 ? (
          <Empty>{m.pet.noIncidents}</Empty>
        ) : (
          <ul className="space-y-3">
            {incidents.data.map((i) => (
              <li key={i.id} className={`rounded-xl border bg-paper p-4 ${i.severity === "high" && !i.resolved_at ? "border-alert" : "border-rule"}`}>
                <p className="mb-1 flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-slate">{when.format(new Date(i.occurred_at))}</span>
                  <Badge tone={i.severity === "low" ? "neutral" : i.severity === "medium" ? "attention" : "alert"}>{m.labels.severityShort[i.severity]}</Badge>
                  <Badge>{incidentCategoryText(m, i.category)}</Badge>
                  {i.vet_visited ? <Badge>{m.pet.vetSeen}</Badge> : null}
                  {i.parent_notified_at ? <Badge tone="good">{m.pet.parentTold}</Badge> : <Badge tone="attention">{m.pet.parentNotTold}</Badge>}
                  {i.resolved_at ? <Badge tone="good">{m.pet.dealtWith}</Badge> : null}
                </p>
                <p className="whitespace-pre-line">{i.description}</p>
                {i.action_taken ? <p className="mt-1 whitespace-pre-line text-slate">{fill(m.pet.whatWeDid, { action: i.action_taken })}</p> : null}
                <div className="mt-2 flex flex-wrap gap-2">
                  {!i.parent_notified_at ? (
                    <ActionForm action={updateIncident} className="contents">
                      <input type="hidden" name="incidentId" value={i.id} />
                      <input type="hidden" name="what" value="told" />
                      <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                        {m.pet.markTold}
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                  {!i.resolved_at ? (
                    <ActionForm action={updateIncident} className="contents">
                      <input type="hidden" name="incidentId" value={i.id} />
                      <input type="hidden" name="what" value="resolved" />
                      <SubmitButton variant="quiet" pendingLabel={m.common.saving}>
                        {m.pet.markDealtWith}
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                  {canManage ? (
                    <Link href={`/app/dogs/${pet.id}/incident?correct=${i.id}`} className={buttonStyles.quiet}>
                      {m.pet.correctIncident}
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
        <Link href={`/app/dogs/${pet.id}/incident`} className={`${buttonStyles.secondary} mt-3`}>
          {m.pet.writeIncident}
        </Link>
      </Section>

      <Section title={m.pet.vaccinations} count={vaccinations.data.length}>
        <div className="space-y-3 rounded-xl border border-rule bg-paper p-4">
          <VaccinationList t={t} records={vaccinations.data} today={today} certificates={certificates} />
          <AddVaccinationForm t={t} petId={pet.id} />
        </div>
      </Section>

      <WeightSection
        t={t}
        petId={pet.id}
        today={today}
        target={pet.target_weight_g}
        weights={weights.data}
        canDelete={canDelete}
      />

      <Section title={m.pet.stays} count={stays.data.length}>
        {stays.data.length === 0 ? (
          <Empty>{m.pet.noStays}</Empty>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {stays.data.map((s) => (
              <li key={s.id}>
                <Link href={`/app/bookings/${s.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                  <span className="flex-1">{stayText(t, s.kind, s.start_date, s.end_date)}</span>
                  {s.kennels ? <span className="door-tag">{s.kennels.name}</span> : null}
                  <Badge tone={s.status === "checked_in" ? "good" : "neutral"}>{m.labels.bookingStatus[s.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={m.pet.photo}>
        <PetPhotoForm t={t} petId={pet.id} hasPhoto={Boolean(pet.photo_path)} />
      </Section>

      <Section title={m.pet.details}>
        <ActionForm action={updatePet} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <input type="hidden" name="petId" value={pet.id} />
          <Field label={f.name}>
            <Input name="name" required maxLength={80} defaultValue={pet.name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={f.animal}>
              <Select name="species" defaultValue={pet.species}>
                <option value="dog">{m.labels.species.dog}</option>
                <option value="cat">{m.labels.species.cat}</option>
                <option value="other">{m.labels.species.other}</option>
              </Select>
            </Field>
            <Field label={f.breed}>
              <Input name="breed" maxLength={80} defaultValue={pet.breed ?? ""} />
            </Field>
            <Field label={f.sex}>
              <Select name="sex" defaultValue={pet.sex}>
                <option value="male">{m.labels.sex.male}</option>
                <option value="female">{m.labels.sex.female}</option>
                <option value="unknown">{m.labels.sex.unknown}</option>
              </Select>
            </Field>
            <Field label={f.neutered}>
              <Select name="isNeutered" defaultValue={pet.is_neutered === null ? "" : pet.is_neutered ? "yes" : "no"}>
                <option value="">{m.common.notKnown}</option>
                <option value="yes">{m.common.yes}</option>
                <option value="no">{m.common.no}</option>
              </Select>
            </Field>
            <Field label={f.dateOfBirth}>
              <Input name="dateOfBirth" type="date" defaultValue={pet.date_of_birth ?? ""} />
            </Field>
            <Field label={f.colour}>
              <Input name="color" maxLength={80} defaultValue={pet.color ?? ""} />
            </Field>
            <Field label={f.microchip}>
              <Input name="microchip" maxLength={40} defaultValue={pet.microchip ?? ""} />
            </Field>
          </div>
          <Field label={f.food} hint={f.foodHint}>
            <Textarea name="foodNotes" maxLength={2000} defaultValue={pet.food_notes ?? ""} />
          </Field>
          <Field label={f.health}>
            <Textarea name="medicalNotes" maxLength={2000} defaultValue={pet.medical_notes ?? ""} />
          </Field>
          <Field label={f.allergies}>
            <Input name="allergies" maxLength={2000} defaultValue={pet.allergies ?? ""} />
          </Field>
          <Field label={f.behaviour}>
            <Textarea name="behaviourNotes" maxLength={2000} defaultValue={pet.behaviour_notes ?? ""} />
          </Field>
          <fieldset>
            <legend className="mb-1 font-semibold">{f.staffShouldKnow}</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {PET_FLAGS.map((flag) => (
                <label key={flag} className="flex min-h-12 items-center gap-3">
                  <input type="checkbox" name={`flag_${flag}`} defaultChecked={pet.flags.includes(flag)} className="size-5" />
                  <span>{flagText(m, flag)}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={f.vet}>
              <Input name="vetName" maxLength={120} defaultValue={pet.vet_name ?? ""} />
            </Field>
            <Field label={f.vetPhone}>
              <Input name="vetPhone" type="tel" maxLength={40} defaultValue={pet.vet_phone ?? ""} />
            </Field>
          </div>
          <SubmitButton pendingLabel={m.common.saving}>{m.common.saveDetails}</SubmitButton>
        </ActionForm>
      </Section>

      {hidden ? null : <HidePanel action={setPetHidden} field="petId" id={pet.id} hidden={false} canManage={canManage} words={hideWords} />}
    </>
  );
}

/** The pet's weights over time (M25): the latest, how it changed, the target, and writing a new one down. */
function WeightSection({
  t,
  petId,
  today,
  target,
  weights,
  canDelete,
}: {
  t: Awaited<ReturnType<typeof getAppI18n>>;
  petId: string;
  today: string;
  target: number | null;
  weights: { id: string; weighed_on: string; weight_g: number; body_condition: number | null; notes: string | null }[];
  canDelete: boolean;
}) {
  const { m, locale } = t;
  const w = m.weights;
  const kg = (g: number) => formatKg(g, locale);
  const [latest, previous] = weights;
  const change = latest && previous ? weightChange(previous.weight_g, latest.weight_g) : null;
  const since = previous ? formatDate(previous.weighed_on, locale) : "";
  return (
    <Section title={w.title}>
      <div className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        {latest ? (
          <div className="space-y-1">
            <p className="text-lg font-bold">{fill(w.latest, { kg: kg(latest.weight_g), date: formatDate(latest.weighed_on, locale) })}</p>
            {change === null ? null : (
              <p className="text-slate">
                {change === 0 ? fill(w.same, { date: since }) : fill(change < 0 ? w.down : w.up, { kg: kg(Math.abs(change)), date: since })}
              </p>
            )}
            {latest.body_condition ? <p className="text-slate">{fill(w.condition, { n: latest.body_condition })}</p> : null}
            {target ? <p className="text-slate">{fill(w.target, { kg: kg(target) })}</p> : null}
          </div>
        ) : (
          <p className="text-slate">{w.none}</p>
        )}

        {weights.length > 0 ? (
          <details>
            <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">
              {w.earlier} ({weights.length})
            </summary>
            <ul className="mt-2 divide-y divide-rule">
              {weights.map((x) => (
                <li key={x.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                  <span className="tabular-nums">{formatDate(x.weighed_on, locale)}</span>
                  <span className="font-semibold tabular-nums">{fill(m.pet.weight, { kg: kg(x.weight_g) })}</span>
                  {x.body_condition ? <span className="text-slate">{fill(w.condition, { n: x.body_condition })}</span> : null}
                  {x.notes ? <span className="w-full text-slate">{x.notes}</span> : null}
                  {canDelete ? (
                    <ActionForm action={removeWeight} className="w-full">
                      <input type="hidden" name="weightId" value={x.id} />
                      <ConfirmStep label={m.common.remove} warning={m.common.cannotUndo} confirm={w.yesRemove} pending={m.common.removing} />
                    </ActionForm>
                  ) : null}
                </li>
              ))}
            </ul>
          </details>
        ) : null}

        <ActionForm action={addWeight} className="space-y-4 border-t border-rule pt-4">
          <p className="font-bold">{w.weigh}</p>
          <input type="hidden" name="petId" value={petId} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={w.weightKg}>
              <Input name="weightKg" inputMode="decimal" required />
            </Field>
            <Field label={w.weighedOn}>
              <Input name="weighedOn" type="date" max={today} defaultValue={today} required />
            </Field>
            <Field label={w.bodyCondition} hint={w.bodyConditionHint}>
              <Select name="bodyCondition" defaultValue="">
                <option value="">{w.notScored}</option>
                {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                  <option key={n} value={String(n)}>
                    {n}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.note}>
              <Input name="notes" maxLength={500} />
            </Field>
          </div>
          <SubmitButton pendingLabel={m.common.saving}>{w.save}</SubmitButton>
        </ActionForm>

        <ActionForm action={setTargetWeight} className="flex flex-wrap items-end gap-2 border-t border-rule pt-4">
          <input type="hidden" name="petId" value={petId} />
          <div className="min-w-48 flex-1">
            <Field label={w.targetLabel} hint={w.targetHint}>
              <Input name="targetKg" inputMode="decimal" defaultValue={target ? String(target / 1000) : ""} />
            </Field>
          </div>
          <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
            {w.saveTarget}
          </SubmitButton>
        </ActionForm>
      </div>
    </Section>
  );
}
