import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Loading, PageTitle, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { INCIDENT_CATEGORIES } from "@/lib/pets";
import { createClient } from "@/lib/supabase/server";
import { addIncident, correctIncident } from "../../actions";

export const generateMetadata = () => appTitle((m) => m.incident.title);

/**
 * Two taps from a pet's row: this page, then Save. The rest can be filled in
 * later. With ?correct={incident id}, an owner or manager corrects one already
 * written.
 */
export default function IncidentPage({ params, searchParams }: PageProps<"/app/dogs/[id]/incident">) {
  return (
    <Suspense fallback={<Loading />}>
      <IncidentForm params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function IncidentForm({ params, searchParams }: Pick<PageProps<"/app/dogs/[id]/incident">, "params" | "searchParams">) {
  const { id } = await params;
  const correcting = (await searchParams).correct;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
  const supabase = await createClient();
  const pet = await supabase.from("pets").select("id, name").eq("org_id", org.id).eq("id", id).is("deleted_at", null).maybeSingle();
  if (pet.error) throw new Error("Could not load the pet.");
  if (!pet.data) notFound();
  const { m } = await getAppI18n();
  const name = pet.data.name;

  // The incident being corrected, when there is one: owners and managers only.
  let current: { id: string; category: string; severity: "low" | "medium" | "high"; description: string; action_taken: string | null; vet_visited: boolean } | null = null;
  if (typeof correcting === "string") {
    if (!canManage || !/^[0-9a-f-]{36}$/.test(correcting)) notFound();
    const res = await supabase
      .from("incidents")
      .select("id, category, severity, description, action_taken, vet_visited")
      .eq("org_id", org.id)
      .eq("pet_id", id)
      .eq("id", correcting)
      .maybeSingle();
    if (res.error) throw new Error("Could not load the incident.");
    if (!res.data) notFound();
    current = res.data;
  }

  return (
    <>
      <PageTitle title={fill(current ? m.incident.correctTitle : m.incident.pageTitle, { pet: name })}>
        <Link href={`/app/dogs/${id}`} className={buttonStyles.quiet}>
          {fill(m.incident.back, { pet: name })}
        </Link>
      </PageTitle>
      {current ? <p className="mb-4 text-slate">{m.incident.correctAbout}</p> : null}
      <ActionForm action={current ? correctIncident : addIncident}>
        <input type="hidden" name="petId" value={id} />
        {current ? <input type="hidden" name="incidentId" value={current.id} /> : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={m.incident.whatHappened}>
            <Select name="category" defaultValue={current?.category ?? "illness"}>
              {INCIDENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {m.labels.incidentCategory[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={m.incident.howSerious}>
            <Select name="severity" defaultValue={current?.severity ?? "low"}>
              {(["low", "medium", "high"] as const).map((s) => (
                <option key={s} value={s}>
                  {m.labels.severity[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label={m.incident.describe} hint={m.incident.describeHint}>
          <Textarea name="description" required maxLength={4000} rows={4} defaultValue={current?.description} />
        </Field>
        <Field label={m.incident.whatWasDone}>
          <Textarea name="actionTaken" maxLength={4000} defaultValue={current?.action_taken ?? ""} />
        </Field>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" name="vetVisited" defaultChecked={current?.vet_visited ?? false} className="size-5" />
          <span>{m.incident.vetSeen}</span>
        </label>
        {current ? null : (
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" name="parentTold" className="size-5" />
            <span>{m.incident.parentTold}</span>
          </label>
        )}
        <SubmitButton pendingLabel={m.common.saving}>{current ? m.common.saveChanges : m.incident.save}</SubmitButton>
      </ActionForm>
    </>
  );
}
