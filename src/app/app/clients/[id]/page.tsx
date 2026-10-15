import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PetAvatar } from "@/components/pet-avatar";
import { Rich } from "@/components/rich";
import { Badge, buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { flagText, stayText } from "@/lib/bookings";
import { formatDate, formatMoney, formatPhone, GST_STATES, normalizePhone, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n } from "@/lib/i18n-server";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { mergeClient, updateClient } from "../actions";

export const generateMetadata = () => appTitle((m) => m.parent.title);

export default function ParentPage({ params, searchParams }: PageProps<"/app/clients/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Parent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Parent({ params, searchParams }: Pick<PageProps<"/app/clients/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const p = m.parent;
  const supabase = await createClient();

  const res = await supabase
    .from("clients")
    .select("id, full_name, phone, alt_phone, email, address, city, postal_code, gst_state_code, tax_id, emergency_name, emergency_phone, notes, consent_at, consent_source")
    .eq("org_id", org.id)
    .eq("id", id)
    .is("deleted_at", null)
    .maybeSingle();
  if (res.error) throw new Error("Could not load the parent.");
  if (!res.data) notFound();
  const c = res.data;

  const [pets, stays, bills] = await Promise.all([
    supabase.from("pets").select("id, name, breed, flags, photo_path").eq("org_id", org.id).eq("client_id", id).is("deleted_at", null).order("name"),
    supabase.from("bookings").select("id, kind, status, start_date, end_date, pets(name)").eq("org_id", org.id).eq("client_id", id).order("start_date", { ascending: false }).limit(50),
    supabase.from("invoices").select("id, status, number, issued_on, total_minor").eq("org_id", org.id).eq("client_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (pets.error || stays.error || bills.error) throw new Error("Could not load the parent.");
  const balances = await supabase.from("invoice_balances").select("invoice_id, due_minor").eq("org_id", org.id).eq("client_id", id);
  const due = new Map((balances.data ?? []).map((b) => [b.invoice_id, b.due_minor ?? 0]));
  const owed = [...due.values()].reduce((n, d) => n + Math.max(d, 0), 0);
  const photos = await signedUrls(supabase, pets.data.map((p) => p.photo_path), { small: true });
  const f = p.fields;
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale: t.locale, trimZeros: true });

  // Merging: find the duplicate by phone number first, then confirm.
  const lookFor = typeof query.same === "string" ? normalizePhone(query.same, org.country_code === "IN" ? "IN" : null) : null;
  const candidate =
    canManage && lookFor
      ? (await supabase.from("clients").select("id, full_name, phone, pets(name)").eq("org_id", org.id).eq("phone", lookFor).is("deleted_at", null).neq("id", id).maybeSingle()).data
      : null;

  return (
    <>
      <PageTitle title={c.full_name}>
        <a href={whatsappLink(fill(parentI18n(org.parent_language, org.locale).m.whatsapp.greeting, { name: c.full_name }), c.phone)} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
          {m.common.whatsapp}
        </a>
      </PageTitle>
      <p className="mb-5 text-lg">
        <a href={`tel:${c.phone}`} className="underline underline-offset-4">
          {formatPhone(c.phone)}
        </a>
        {c.alt_phone ? <span className="text-slate">{fill(p.alsoPhone, { phone: formatPhone(c.alt_phone) })}</span> : null}
        {owed > 0 ? (
          <>
            {" "}
            <Badge tone="attention">{fill(p.owed, { amount: money(owed) })}</Badge>
          </>
        ) : null}
      </p>

      {query.done === "merged" ? <Notice tone="ok">{p.merged}</Notice> : null}
      {c.consent_at ? null : <Notice tone="info">{p.noConsent}</Notice>}

      <Section title={p.pets} count={pets.data.length}>
        {pets.data.length === 0 ? (
          <Empty>{p.noPets}</Empty>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {pets.data.map((p) => (
              <li key={p.id}>
                <Link href={`/app/dogs/${p.id}`} className="flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-ground">
                  <PetAvatar name={p.name} url={p.photo_path ? photos.get(p.photo_path) : null} />
                  <span className="flex flex-1 flex-wrap items-center gap-2">
                    <span className="font-bold">{p.name}</span>
                    {p.breed ? <span className="text-slate">{p.breed}</span> : null}
                    {p.flags.map((f) => (
                      <Badge key={f} tone="alert">
                        {flagText(m, f)}
                      </Badge>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={p.stays} count={stays.data.length}>
        {stays.data.length === 0 ? (
          <Empty>{p.noStays}</Empty>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {stays.data.map((s) => (
              <li key={s.id}>
                <Link href={`/app/bookings/${s.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                  <span className="font-semibold">{s.pets?.name}</span>
                  <span className="flex-1 text-slate">{stayText(t, s.kind, s.start_date, s.end_date)}</span>
                  <Badge tone={s.status === "checked_in" ? "good" : "neutral"}>{m.labels.bookingStatus[s.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title={p.bills} count={bills.data.length}>
        {bills.data.length === 0 ? (
          <Empty>{p.noBills}</Empty>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {bills.data.map((b) => {
              const d = due.get(b.id) ?? 0;
              return (
                <li key={b.id}>
                  <Link href={`/app/bills/${b.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                    <span className="font-semibold">{b.number ?? m.labels.invoiceStatus.draft}</span>
                    <span className="flex-1 text-slate">{b.issued_on ? formatDate(b.issued_on, t.locale) : ""}</span>
                    {b.status === "void" ? <Badge tone="alert">{m.labels.invoiceStatus.void}</Badge> : null}
                    {b.status === "issued" ? d > 0 ? <Badge tone="attention">{fill(p.due, { amount: money(d) })}</Badge> : <Badge tone="good">{p.paid}</Badge> : null}
                    <span className="tabular-nums">{money(b.total_minor)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title={p.details}>
        <ActionForm action={updateClient} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <input type="hidden" name="clientId" value={c.id} />
          <Field label={f.name}>
            <Input name="full_name" required maxLength={120} defaultValue={c.full_name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={f.mobile} hint={f.mobileHint}>
              <Input name="phone" type="tel" required defaultValue={c.phone} />
            </Field>
            <Field label={f.altPhone}>
              <Input name="alt_phone" type="tel" defaultValue={c.alt_phone ?? ""} />
            </Field>
            <Field label={f.email}>
              <Input name="email" type="email" defaultValue={c.email ?? ""} />
            </Field>
            <Field label={f.city}>
              <Input name="city" defaultValue={c.city ?? ""} />
            </Field>
          </div>
          <Field label={f.address}>
            <Textarea name="address" rows={2} maxLength={500} defaultValue={c.address ?? ""} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={f.postalCode}>
              <Input name="postal_code" maxLength={12} defaultValue={c.postal_code ?? ""} />
            </Field>
            <Field label={f.emergencyName}>
              <Input name="emergency_name" maxLength={120} defaultValue={c.emergency_name ?? ""} />
            </Field>
            <Field label={f.emergencyPhone}>
              <Input name="emergency_phone" type="tel" defaultValue={c.emergency_phone ?? ""} />
            </Field>
            <Field label={f.gstin} hint={f.gstinHint}>
              <Input name="tax_id" maxLength={15} autoCapitalize="characters" defaultValue={c.tax_id ?? ""} />
            </Field>
            <Field label={f.gstState}>
              <Select name="gst_state_code" defaultValue={c.gst_state_code ?? ""}>
                <option value="">{f.gstStateFromGstin}</option>
                {Object.entries(GST_STATES).map(([code, state]) => (
                  <option key={code} value={code}>
                    {code} {state}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label={f.notes}>
            <Textarea name="notes" maxLength={2000} defaultValue={c.notes ?? ""} />
          </Field>
          {c.consent_at ? (
            <p className="text-sm text-slate">
              {fill(c.consent_source === "intake_form" ? p.consentFromIntake : p.consentToStaff, { date: formatDate(c.consent_at.slice(0, 10), t.locale) })}
            </p>
          ) : (
            <label className="flex min-h-12 items-start gap-3">
              <input type="checkbox" name="consent" className="mt-1 size-5" />
              <span>{p.consentTick}</span>
            </label>
          )}
          <SubmitButton pendingLabel={m.common.saving}>{m.common.saveDetails}</SubmitButton>
        </ActionForm>
      </Section>

      {canManage ? (
        <Section title={p.merge.title}>
          <div className="space-y-3 rounded-xl border border-rule bg-paper p-4">
            <p className="text-slate">{p.merge.intro}</p>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Field label={p.merge.otherPhone}>
                  <Input name="same" type="tel" defaultValue={typeof query.same === "string" ? query.same : ""} />
                </Field>
              </div>
              <button type="submit" className={buttonStyles.secondary}>
                {m.common.find}
              </button>
            </form>
            {lookFor && !candidate ? <p className="text-slate">{p.merge.noMatch}</p> : null}
            {candidate ? (
              <ActionForm action={mergeClient} className="space-y-3 rounded-lg bg-marigold-soft p-3">
                <input type="hidden" name="keepId" value={c.id} />
                <input type="hidden" name="mergeId" value={candidate.id} />
                <p>
                  <Rich
                    text={candidate.pets.length > 0 ? p.merge.confirmWithPets : p.merge.confirm}
                    parts={{
                      other: <strong>{candidate.full_name}</strong>,
                      phone: formatPhone(candidate.phone),
                      pets: candidate.pets.map((pet) => pet.name).join(", "),
                      name: c.full_name,
                    }}
                  />
                </p>
                <SubmitButton pendingLabel={p.merge.merging}>{fill(p.merge.button, { name: c.full_name })}</SubmitButton>
              </ActionForm>
            ) : null}
          </div>
        </Section>
      ) : null}
    </>
  );
}
