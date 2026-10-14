import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Loading, PageTitle, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { INCIDENT_CATEGORIES, INCIDENT_CATEGORY_LABEL, SEVERITY_LABEL } from "@/lib/pets";
import { createClient } from "@/lib/supabase/server";
import { addIncident } from "../../actions";

export const metadata: Metadata = { title: "Write down an incident" };

/** Two taps from a pet's row: this page, then Save. The rest can be filled in later. */
export default function IncidentPage({ params }: PageProps<"/app/dogs/[id]/incident">) {
  return (
    <Suspense fallback={<Loading />}>
      <IncidentForm params={params} />
    </Suspense>
  );
}

async function IncidentForm({ params }: Pick<PageProps<"/app/dogs/[id]/incident">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org } = await requireOrg();
  const supabase = await createClient();
  const pet = await supabase.from("pets").select("id, name").eq("org_id", org.id).eq("id", id).is("deleted_at", null).maybeSingle();
  if (pet.error) throw new Error("Could not load the pet.");
  if (!pet.data) notFound();

  return (
    <>
      <PageTitle title={`Incident: ${pet.data.name}`}>
        <Link href={`/app/dogs/${id}`} className={buttonStyles.quiet}>
          Back to {pet.data.name}
        </Link>
      </PageTitle>
      <ActionForm action={addIncident}>
        <input type="hidden" name="petId" value={id} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="What happened">
            <Select name="category" defaultValue="illness">
              {INCIDENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {INCIDENT_CATEGORY_LABEL[c]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="How serious">
            <Select name="severity" defaultValue="low">
              {(["low", "medium", "high"] as const).map((s) => (
                <option key={s} value={s}>
                  {SEVERITY_LABEL[s]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="Describe it" hint="What you saw, when, and who was there.">
          <Textarea name="description" required maxLength={4000} rows={4} />
        </Field>
        <Field label="What was done">
          <Textarea name="actionTaken" maxLength={4000} />
        </Field>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" name="vetVisited" className="size-5" />
          <span>A vet has seen the pet</span>
        </label>
        <label className="flex min-h-12 items-center gap-3">
          <input type="checkbox" name="parentTold" className="size-5" />
          <span>The parent has been told</span>
        </label>
        <SubmitButton pendingLabel="Saving">Save incident</SubmitButton>
      </ActionForm>
    </>
  );
}
