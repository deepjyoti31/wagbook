import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Loading, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatPhone, intakeInviteMessage, isISODate, whatsappLink } from "@/lib/core";
import { IntakePayload } from "@/lib/intake";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { acceptSubmission, rejectSubmission } from "./actions";

export const metadata: Metadata = { title: "Forms from parents" };

export default function IntakePage() {
  return (
    <>
      <PageTitle title="Forms from parents" />
      <Suspense fallback={<Loading label="Loading forms" />}>
        <Intake />
      </Suspense>
    </>
  );
}

async function Intake() {
  const { org } = await requireOrg();
  const supabase = await createClient();
  const [{ data, error }, origin] = await Promise.all([
    supabase
      .from("intake_submissions")
      .select("id, parent_name, parent_phone, requested_start, requested_end, payload, created_at")
      .eq("org_id", org.id)
      .eq("status", "new")
      .order("created_at")
      .limit(100),
    siteOrigin(),
  ]);
  if (error) throw new Error("Could not load forms.");

  const intakeUrl = `${origin}/i/${org.slug}`;

  // Which of these parents is already a client? Accepting adds their new pets
  // to the existing client and never rewrites the client's own details.
  const phones = [...new Set(data.map((s) => s.parent_phone))];
  const known = new Map<string, string>();
  if (phones.length > 0) {
    const clients = await supabase.from("clients").select("phone, full_name").eq("org_id", org.id).in("phone", phones).is("deleted_at", null);
    for (const c of clients.data ?? []) known.set(c.phone, c.full_name);
  }

  return (
    <>
      <Section title="Your intake link">
        <div className="rounded-xl border border-rule bg-paper p-4">
          <p className="mb-3 text-slate">
            Send this to a parent before their first stay. They fill in their pet&apos;s food, health and vaccination details themselves, and it
            lands here for you to check.
          </p>
          <p className="mb-3 break-all font-semibold">{intakeUrl}</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={whatsappLink(intakeInviteMessage({ kennelName: org.name, intakeUrl }))}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles.whatsapp}
            >
              Send on WhatsApp
            </a>
            <a href={intakeUrl} target="_blank" rel="noreferrer" className={buttonStyles.secondary}>
              Open the form
            </a>
          </div>
          {org.intake_enabled ? null : <p className="mt-3 font-semibold text-alert">The form is switched off in Settings, so parents cannot submit it.</p>}
        </div>
      </Section>

      <Section title="Waiting for you" count={data.length}>
        {data.length === 0 ? (
          <Empty>No new forms. When a parent submits your intake form, it appears here.</Empty>
        ) : (
          <ul className="space-y-4">
            {data.map((s) => {
              // The payload came from the public internet. Read it through the schema, and show nothing if it does not fit.
              const parsed = IntakePayload.safeParse(s.payload);
              const pets = parsed.success ? parsed.data.pets : [];
              const stay = parsed.success ? parsed.data.stay : null;
              return (
                <li key={s.id} className="rounded-xl border border-rule bg-paper p-4">
                  <p className="text-lg font-bold">
                    {s.parent_name} {known.has(s.parent_phone) ? <Badge tone="attention">Has been here before as {known.get(s.parent_phone)}</Badge> : null}
                  </p>
                  <p className="text-slate">
                    <a href={`tel:${s.parent_phone}`} className="underline underline-offset-4">
                      {formatPhone(s.parent_phone)}
                    </a>
                    {s.requested_start && isISODate(s.requested_start)
                      ? `. Wants ${formatDate(s.requested_start)}${s.requested_end && isISODate(s.requested_end) && s.requested_end !== s.requested_start ? ` to ${formatDate(s.requested_end)}` : ""}`
                      : ""}
                    {stay?.kind === "daycare" ? " (day boarding)" : ""}.
                  </p>
                  <ul className="mt-3 space-y-3">
                    {pets.map((p, i) => (
                      <li key={i} className="border-l-4 border-marigold pl-3">
                        <p className="font-bold">
                          {p.name} <span className="font-normal text-slate">{[p.species, p.breed, p.weight_kg ? `${p.weight_kg} kg` : null].filter(Boolean).join(", ")}</span>
                        </p>
                        {p.food_notes ? <p>Food: {p.food_notes}</p> : null}
                        {p.medical_notes ? (
                          <p>
                            <Badge tone="alert">Medical</Badge> {p.medical_notes}
                          </p>
                        ) : null}
                        {p.allergies ? (
                          <p>
                            <Badge tone="alert">Allergies</Badge> {p.allergies}
                          </p>
                        ) : null}
                        {p.behaviour_notes ? <p>Behaviour: {p.behaviour_notes}</p> : null}
                        {p.vaccinations.length > 0 ? (
                          <p className="text-slate">
                            Vaccines: {p.vaccinations.map((v) => `${v.vaccine}${v.valid_until ? ` (valid to ${v.valid_until})` : ""}`).join(", ")}
                          </p>
                        ) : (
                          <p className="text-slate">No vaccination details given.</p>
                        )}
                      </li>
                    ))}
                  </ul>
                  {stay?.notes ? <p className="mt-3">Note from parent: {stay.notes}</p> : null}
                  {parsed.success ? null : <p className="mt-3 font-semibold text-alert">This form could not be read fully. Call the parent to confirm the details.</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {parsed.success ? (
                      <ActionForm action={acceptSubmission} className="contents">
                        <input type="hidden" name="submissionId" value={s.id} />
                        <SubmitButton pendingLabel="Accepting">Accept and book</SubmitButton>
                      </ActionForm>
                    ) : null}
                    <ActionForm action={rejectSubmission} className="contents">
                      <input type="hidden" name="submissionId" value={s.id} />
                      <SubmitButton variant="quiet" pendingLabel="Removing">
                        Decline
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={rejectSubmission} className="contents">
                      <input type="hidden" name="submissionId" value={s.id} />
                      <input type="hidden" name="spam" value="true" />
                      <SubmitButton variant="quiet" pendingLabel="Removing">
                        Mark as junk
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </>
  );
}
