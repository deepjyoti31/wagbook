import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PetAvatar } from "@/components/pet-avatar";
import { Badge, buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { INVOICE_STATUS_LABEL } from "@/lib/billing";
import { flagText, STATUS_LABEL, stayText } from "@/lib/bookings";
import { formatDate, formatMoney, formatPhone, GST_STATES, normalizePhone, whatsappLink } from "@/lib/core";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";
import { mergeClient, updateClient } from "../actions";

export const metadata: Metadata = { title: "Parent" };

export default function ParentPage({ params, searchParams }: PageProps<"/app/clients/[id]">) {
  return (
    <Suspense fallback={<Loading label="Loading the parent" />}>
      <Parent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Parent({ params, searchParams }: Pick<PageProps<"/app/clients/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
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
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale: org.locale, trimZeros: true });

  // Merging: find the duplicate by phone number first, then confirm.
  const lookFor = typeof query.same === "string" ? normalizePhone(query.same, org.country_code === "IN" ? "IN" : null) : null;
  const candidate =
    canManage && lookFor
      ? (await supabase.from("clients").select("id, full_name, phone, pets(name)").eq("org_id", org.id).eq("phone", lookFor).is("deleted_at", null).neq("id", id).maybeSingle()).data
      : null;

  return (
    <>
      <PageTitle title={c.full_name}>
        <a href={whatsappLink(`Hi ${c.full_name}, `, c.phone)} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
          WhatsApp
        </a>
      </PageTitle>
      <p className="mb-5 text-lg">
        <a href={`tel:${c.phone}`} className="underline underline-offset-4">
          {formatPhone(c.phone)}
        </a>
        {c.alt_phone ? <span className="text-slate">, also {formatPhone(c.alt_phone)}</span> : null}
        {owed > 0 ? (
          <>
            {" "}
            <Badge tone="attention">{money(owed)} owed</Badge>
          </>
        ) : null}
      </p>

      {query.done === "merged" ? <Notice tone="ok">Merged. Everything from the other record is here now.</Notice> : null}
      {c.consent_at ? null : <Notice tone="info">No consent on record to keep these details. Ask, and tick it below.</Notice>}

      <Section title="Pets" count={pets.data.length}>
        {pets.data.length === 0 ? (
          <Empty>No pets.</Empty>
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
                        {flagText(f)}
                      </Badge>
                    ))}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Stays" count={stays.data.length}>
        {stays.data.length === 0 ? (
          <Empty>No stays yet.</Empty>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {stays.data.map((s) => (
              <li key={s.id}>
                <Link href={`/app/bookings/${s.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                  <span className="font-semibold">{s.pets?.name}</span>
                  <span className="flex-1 text-slate">{stayText(s.kind, s.start_date, s.end_date)}</span>
                  <Badge tone={s.status === "checked_in" ? "good" : "neutral"}>{STATUS_LABEL[s.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Section>

      <Section title="Bills" count={bills.data.length}>
        {bills.data.length === 0 ? (
          <Empty>No bills yet.</Empty>
        ) : (
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {bills.data.map((b) => {
              const d = due.get(b.id) ?? 0;
              return (
                <li key={b.id}>
                  <Link href={`/app/bills/${b.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                    <span className="font-semibold">{b.number ?? "Draft"}</span>
                    <span className="flex-1 text-slate">{b.issued_on ? formatDate(b.issued_on) : ""}</span>
                    {b.status === "void" ? <Badge tone="alert">{INVOICE_STATUS_LABEL.void}</Badge> : null}
                    {b.status === "issued" ? d > 0 ? <Badge tone="attention">{money(d)} due</Badge> : <Badge tone="good">Paid</Badge> : null}
                    <span className="tabular-nums">{money(b.total_minor)}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </Section>

      <Section title="Details">
        <ActionForm action={updateClient} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <input type="hidden" name="clientId" value={c.id} />
          <Field label="Name">
            <Input name="full_name" required maxLength={120} defaultValue={c.full_name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Mobile number" hint="Also how WhatsApp reaches them.">
              <Input name="phone" type="tel" required defaultValue={c.phone} />
            </Field>
            <Field label="Another number">
              <Input name="alt_phone" type="tel" defaultValue={c.alt_phone ?? ""} />
            </Field>
            <Field label="Email">
              <Input name="email" type="email" defaultValue={c.email ?? ""} />
            </Field>
            <Field label="City">
              <Input name="city" defaultValue={c.city ?? ""} />
            </Field>
          </div>
          <Field label="Address">
            <Textarea name="address" rows={2} maxLength={500} defaultValue={c.address ?? ""} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="PIN code">
              <Input name="postal_code" maxLength={12} defaultValue={c.postal_code ?? ""} />
            </Field>
            <Field label="Someone else we can call">
              <Input name="emergency_name" maxLength={120} defaultValue={c.emergency_name ?? ""} />
            </Field>
            <Field label="Their number">
              <Input name="emergency_phone" type="tel" defaultValue={c.emergency_phone ?? ""} />
            </Field>
            <Field label="GSTIN" hint="Only for a business that wants it on the bill.">
              <Input name="tax_id" maxLength={15} autoCapitalize="characters" defaultValue={c.tax_id ?? ""} />
            </Field>
            <Field label="State, for GST">
              <Select name="gst_state_code" defaultValue={c.gst_state_code ?? ""}>
                <option value="">Take it from the GSTIN</option>
                {Object.entries(GST_STATES).map(([code, state]) => (
                  <option key={code} value={code}>
                    {code} {state}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Notes for staff">
            <Textarea name="notes" maxLength={2000} defaultValue={c.notes ?? ""} />
          </Field>
          {c.consent_at ? (
            <p className="text-sm text-slate">
              Agreed to the kennel keeping these details on {formatDate(c.consent_at.slice(0, 10))}
              {c.consent_source === "intake_form" ? ", on the intake form." : ", told to staff."}
            </p>
          ) : (
            <label className="flex min-h-12 items-start gap-3">
              <input type="checkbox" name="consent" className="mt-1 size-5" />
              <span>The parent agreed to us keeping these details</span>
            </label>
          )}
          <SubmitButton>Save details</SubmitButton>
        </ActionForm>
      </Section>

      {canManage ? (
        <Section title="Same person as another parent?">
          <div className="space-y-3 rounded-xl border border-rule bg-paper p-4">
            <p className="text-slate">If this parent is on the list twice, find the other record by its phone number and merge it into this one.</p>
            <form method="get" className="flex flex-wrap items-end gap-2">
              <div className="min-w-48 flex-1">
                <Field label="The other record's phone number">
                  <Input name="same" type="tel" defaultValue={typeof query.same === "string" ? query.same : ""} />
                </Field>
              </div>
              <button type="submit" className={buttonStyles.secondary}>
                Find
              </button>
            </form>
            {lookFor && !candidate ? <p className="text-slate">No other parent has that number.</p> : null}
            {candidate ? (
              <ActionForm action={mergeClient} className="space-y-3 rounded-lg bg-marigold-soft p-3">
                <input type="hidden" name="keepId" value={c.id} />
                <input type="hidden" name="mergeId" value={candidate.id} />
                <p>
                  Merge <strong>{candidate.full_name}</strong> ({formatPhone(candidate.phone)}
                  {candidate.pets.length > 0 ? `, ${candidate.pets.map((p) => p.name).join(", ")}` : ""}) into {c.full_name}? Their pets, stays, bills and
                  payments move here, and the other record disappears from lists. This cannot be undone from the screen.
                </p>
                <SubmitButton pendingLabel="Merging">Merge into {c.full_name}</SubmitButton>
              </ActionForm>
            ) : null}
          </div>
        </Section>
      ) : null}
    </>
  );
}
