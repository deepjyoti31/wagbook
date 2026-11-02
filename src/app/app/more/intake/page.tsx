import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Rich } from "@/components/rich";
import { CopyButton } from "@/components/copy-button";
import { Badge, buttonStyles, Empty, Loading, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatPhone, intakeInviteMessage, isISODate, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n } from "@/lib/i18n-server";
import { IntakePayload } from "@/lib/intake";
import { sourceText } from "@/lib/site-request";
import { signedUrls } from "@/lib/media";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { acceptSubmission, rejectSubmission } from "./actions";

export const generateMetadata = () => appTitle((m) => m.intake.title);

export default function IntakePage() {
  return (
    <Suspense fallback={<Loading />}>
      <Intake />
    </Suspense>
  );
}

async function Intake() {
  const { org } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const k = m.intake;
  // The invitation goes to a parent, so it is written in the kennel's parent language.
  const parent = parentI18n(org.parent_language, org.locale);
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
  const bookUrl = `${origin}/book/${org.slug}`;
  // Names of the services asked for on the booking form (M41).
  const asked = [...new Set(data.flatMap((s) => (s.payload as { request?: { service_id?: unknown } }).request?.service_id ?? []).filter((x): x is string => typeof x === "string"))];
  const services = asked.length > 0 ? ((await supabase.from("appointment_services").select("id, name").eq("org_id", org.id).in("id", asked.filter((x) => /^[0-9a-f-]{36}$/.test(x)))).data ?? []) : [];

  // Certificates parents sent with their forms: {org}/intake/{form}/pet-N, and
  // pet-N-2 for a pet's second vaccine. Only those that exist come back with a link.
  const certificatePaths = (submission: string, i: number) => [`${org.id}/intake/${submission}/pet-${i + 1}`, `${org.id}/intake/${submission}/pet-${i + 1}-2`];
  const certificates = await signedUrls(
    supabase,
    data.flatMap((s) => (Array.isArray((s.payload as { pets?: unknown }).pets) ? ((s.payload as { pets: unknown[] }).pets.flatMap((_, i) => certificatePaths(s.id, i))) : [])),
  );

  // Which of these parents is already a client? Accepting adds their new pets
  // to the existing client and never rewrites the client's own details.
  const phones = [...new Set(data.map((s) => s.parent_phone))];
  const known = new Map<string, string>();
  if (phones.length > 0) {
    const clients = await supabase.from("clients").select("phone, full_name").eq("org_id", org.id).in("phone", phones).is("deleted_at", null);
    for (const c of clients.data ?? []) known.set(c.phone, c.full_name);
  }

  /** The requested dates: one day, or a first and last day. */
  const wanted = (start: string, end: string | null) =>
    end && isISODate(end) && end !== start ? fill(m.stay.dates, { start: formatDate(start, locale), end: formatDate(end, locale) }) : formatDate(start, locale);

  return (
    <>
      <PageTitle title={k.title} />
      <Section title={k.link}>
        <div className="rounded-xl border border-rule bg-paper p-4">
          <p className="mb-3 text-slate">{k.linkAbout}</p>
          <p className="mb-3 break-all font-semibold">{intakeUrl}</p>
          <div className="flex flex-wrap gap-2">
            <a
              href={whatsappLink(intakeInviteMessage(parent.m.whatsapp, { kennelName: org.name, intakeUrl }))}
              target="_blank"
              rel="noreferrer"
              className={buttonStyles.whatsapp}
            >
              {m.common.sendOnWhatsapp}
            </a>
            <a href={intakeUrl} target="_blank" rel="noreferrer" className={buttonStyles.secondary}>
              {k.openForm}
            </a>
          </div>
          {org.intake_enabled ? null : <p className="mt-3 font-semibold text-alert">{k.switchedOff}</p>}
        </div>
      </Section>

      <Section title={m.bookingForm.linkTitle}>
        <div className="rounded-xl border border-rule bg-paper p-4">
          <p className="mb-3 text-slate">{m.bookingForm.linkAbout}</p>
          <p className="mb-3 break-all font-semibold">{bookUrl}</p>
          <div className="flex flex-wrap gap-2">
            <CopyButton text={bookUrl} words={m.copy} />
            <a href={bookUrl} target="_blank" rel="noreferrer" className={buttonStyles.secondary}>
              {k.openForm}
            </a>
          </div>
        </div>
      </Section>

      <Section title={k.waiting} count={data.length}>
        {data.length === 0 ? (
          <Empty>{k.empty}</Empty>
        ) : (
          <ul className="space-y-4">
            {data.map((s) => {
              // The payload came from the public internet. Read it through the schema, and show nothing if it does not fit.
              const parsed = IntakePayload.safeParse(s.payload);
              const pets = parsed.success ? parsed.data.pets : [];
              const stay = parsed.success ? parsed.data.stay : null;
              const daycare = stay?.kind === "daycare";
              const dates = s.requested_start && isISODate(s.requested_start) ? wanted(s.requested_start, s.requested_end) : null;
              const line = dates ? (daycare ? k.phoneWantsDaycare : k.phoneWants) : daycare ? k.phoneDaycare : k.phone;
              const knownAs = known.get(s.parent_phone);
              return (
                <li key={s.id} className="rounded-xl border border-rule bg-paper p-4">
                  <p className="text-lg font-bold">
                    {s.parent_name} {knownAs !== undefined ? <Badge tone="attention">{fill(k.beenBefore, { name: knownAs })}</Badge> : null}
                  </p>
                  <p className="text-slate">
                    <Rich
                      text={line}
                      parts={{
                        phone: (
                          <a href={`tel:${s.parent_phone}`} className="underline underline-offset-4">
                            {formatPhone(s.parent_phone)}
                          </a>
                        ),
                        dates: dates ?? "",
                      }}
                    />
                  </p>
                  <ul className="mt-3 space-y-3">
                    {pets.map((p, i) => (
                      <li key={i} className="border-l-4 border-marigold pl-3">
                        <p className="font-bold">
                          {p.name}{" "}
                          <span className="font-normal text-slate">
                            {[k.speciesInList[p.species], p.breed, p.weight_kg ? fill(k.weight, { n: p.weight_kg }) : null].filter(Boolean).join(", ")}
                          </span>
                        </p>
                        {p.food_notes ? <p>{fill(k.food, { notes: p.food_notes })}</p> : null}
                        {p.medical_notes ? (
                          <p>
                            <Badge tone="alert">{k.medical}</Badge> {p.medical_notes}
                          </p>
                        ) : null}
                        {p.allergies ? (
                          <p>
                            <Badge tone="alert">{k.allergies}</Badge> {p.allergies}
                          </p>
                        ) : null}
                        {p.behaviour_notes ? <p>{fill(k.behaviour, { notes: p.behaviour_notes })}</p> : null}
                        {p.vaccinations.length > 0 ? (
                          <p className="text-slate">
                            {fill(k.vaccines, {
                              list: p.vaccinations.map((v) => (v.valid_until ? fill(k.vaccineValidTo, { vaccine: v.vaccine, date: v.valid_until }) : v.vaccine)).join(", "),
                            })}
                          </p>
                        ) : (
                          <p className="text-slate">{k.noVaccines}</p>
                        )}
                        {p.dewormed_on || p.tick_treated_on ? (
                          <p className="text-slate">
                            {[
                              p.dewormed_on ? `${m.health.dewormedOn}: ${p.dewormed_on}` : null,
                              p.tick_treated_on ? `${m.health.tickTreatedOn}: ${p.tick_treated_on}` : null,
                            ]
                              .filter(Boolean)
                              .join(", ")}
                          </p>
                        ) : null}
                        {certificatePaths(s.id, i).map((path) =>
                          certificates.get(path) ? (
                            <a key={path} href={certificates.get(path)} target="_blank" rel="noreferrer" className="mr-4 inline-flex min-h-12 items-center underline underline-offset-4">
                              {fill(k.certificate, { pet: p.name })}
                            </a>
                          ) : null,
                        )}
                      </li>
                    ))}
                  </ul>
                  {stay?.notes ? <p className="mt-3">{fill(k.note, { note: stay.notes })}</p> : null}
                  {parsed.success && parsed.data.site?.ref ? <p className="mt-3 text-slate">{fill(m.site.ref, { ref: parsed.data.site.ref })}</p> : null}
                  {parsed.success && parsed.data.site && sourceText(parsed.data.site) ? (
                    <p className="text-slate">{fill(m.site.came, { source: sourceText(parsed.data.site) ?? "" })}</p>
                  ) : null}
                  {parsed.success && parsed.data.request ? (
                    <div className="mt-3 space-y-1 rounded-lg bg-ground p-3">
                      <p className="font-semibold">
                        {parsed.data.request.service_id
                          ? fill(parsed.data.request.time ? m.bookingForm.review.appointment : m.bookingForm.review.appointmentNoTime, {
                              service: services.find((x) => x.id === parsed.data.request?.service_id)?.name ?? "",
                              time: parsed.data.request.time ?? "",
                            })
                          : m.bookingForm.review.stay}
                      </p>
                      {parsed.data.request.pickup === "true" ? <p>{m.bookingForm.review.pickup}</p> : null}
                      <p>{parsed.data.request.vaccinations_ok === "true" ? m.bookingForm.review.vaccinationsOk : m.bookingForm.review.vaccinationsNotSaid}</p>
                    </div>
                  ) : null}
                  {parsed.success ? null : <p className="mt-3 font-semibold text-alert">{k.unreadable}</p>}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {parsed.success ? (
                      <ActionForm action={acceptSubmission} className="contents">
                        <input type="hidden" name="submissionId" value={s.id} />
                        <SubmitButton pendingLabel={k.accepting}>{k.accept}</SubmitButton>
                      </ActionForm>
                    ) : null}
                    <ActionForm action={rejectSubmission} className="contents">
                      <input type="hidden" name="submissionId" value={s.id} />
                      <SubmitButton variant="quiet" pendingLabel={m.common.removing}>
                        {k.decline}
                      </SubmitButton>
                    </ActionForm>
                    <ActionForm action={rejectSubmission} className="contents">
                      <input type="hidden" name="submissionId" value={s.id} />
                      <input type="hidden" name="spam" value="true" />
                      <SubmitButton variant="quiet" pendingLabel={m.common.removing}>
                        {k.junk}
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
