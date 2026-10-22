import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { CopyButton } from "@/components/copy-button";
import { HidePanel } from "@/components/hide-panel";
import { ParentCredit } from "@/components/parent-credit";
import { PetAvatar } from "@/components/pet-avatar";
import { Rich } from "@/components/rich";
import { Badge, buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { flagText, stayText } from "@/lib/bookings";
import { areaFor, formatDate, formatMoney, formatPhone, GST_STATES, normalizePhone, todayIn, whatsappLink } from "@/lib/core";
import { fill, LANGUAGE_NAMES } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n } from "@/lib/i18n-server";
import { signedUrls } from "@/lib/media";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { addAddress, changeAddress, eraseClient, mergeClient, removeAddress, renewRequestLink, sellPack, setParentHidden, updateClient } from "../actions";

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
  const { org, canManage, canDelete } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const p = m.parent;
  const supabase = await createClient();

  const res = await supabase
    .from("clients")
    .select("id, full_name, phone, alt_phone, email, address, city, postal_code, gst_state_code, tax_id, emergency_name, emergency_phone, notes, consent_at, consent_source, bill_translation, request_token, deleted_at, erased_at")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (res.error) throw new Error("Could not load the parent.");
  // A hidden parent still has a page, reached from their pets; an erased one does not.
  if (!res.data || res.data.erased_at) notFound();
  const c = res.data;
  const hidden = c.deleted_at !== null;

  const [pets, stays, bills] = await Promise.all([
    supabase.from("pets").select("id, name, breed, flags, photo_path, deleted_at").eq("org_id", org.id).eq("client_id", id).order("name"),
    supabase.from("bookings").select("id, kind, status, start_date, end_date, pets(name)").eq("org_id", org.id).eq("client_id", id).order("start_date", { ascending: false }).limit(50),
    supabase.from("invoices").select("id, status, number, issued_on, total_minor").eq("org_id", org.id).eq("client_id", id).order("created_at", { ascending: false }).limit(50),
  ]);
  if (pets.error || stays.error || bills.error) throw new Error("Could not load the parent.");
  const balances = await supabase.from("invoice_balances").select("invoice_id, due_minor").eq("org_id", org.id).eq("client_id", id);
  const due = new Map((balances.data ?? []).map((b) => [b.invoice_id, b.due_minor ?? 0]));
  const owed = [...due.values()].reduce((n, d) => n + Math.max(d, 0), 0);
  const photos = await signedUrls(supabase, pets.data.map((p) => p.photo_path), { small: true });
  const f = p.fields;
  const hideWords = { title: m.hiding.title, about: m.hiding.parentAbout, hide: m.hiding.hideParent, hidden: m.hiding.hiddenParent, show: m.hiding.show, saving: m.common.saving };
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
      {query.done === "hidden" ? <Notice tone="ok">{m.hiding.doneHidden}</Notice> : null}
      {query.done === "shown" && !hidden ? <Notice tone="ok">{m.hiding.doneShown}</Notice> : null}
      {hidden ? <HidePanel action={setParentHidden} field="clientId" id={c.id} hidden canManage={canManage} words={hideWords} /> : null}
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
                    {p.deleted_at ? <Badge>{m.hiding.badge}</Badge> : null}
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

      {org.offers_food_delivery ? <Addresses t={t} org={org} clientId={c.id} canManage={canManage} canDelete={canDelete} /> : null}

      <Packs t={t} org={org} clientId={c.id} canManage={canManage && !hidden} />
      <ParentCredit t={t} org={org} clientId={c.id} canManage={canManage && !hidden} />

      {c.request_token && !hidden ? <RequestLink t={t} org={org} client={{ id: c.id, name: c.full_name, phone: c.phone, token: c.request_token }} /> : null}

      <Section title={p.details}>
        <ActionForm action={updateClient} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <input type="hidden" name="clientId" value={c.id} />
          <Field label={f.name}>
            <Input name="full_name" required maxLength={120} defaultValue={c.full_name} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            {canManage ? (
              <>
                <Field label={f.mobile} hint={f.mobileHint}>
                  <Input name="phone" type="tel" required defaultValue={c.phone} />
                </Field>
                <Field label={f.altPhone}>
                  <Input name="alt_phone" type="tel" defaultValue={c.alt_phone ?? ""} />
                </Field>
              </>
            ) : (
              <p className="text-slate sm:col-span-2">{p.phoneByManager}</p>
            )}
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
            <Field label={f.billLanguage} hint={f.billLanguageHint}>
              <Select name="bill_translation" defaultValue={c.bill_translation ?? ""}>
                <option value="">{f.billEnglishOnly}</option>
                {(["hi", "kn"] as const).map((l) => (
                  <option key={l} value={l}>
                    {fill(f.billWith, { language: LANGUAGE_NAMES[l] })}
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

      {canManage ? (
        <Section title={p.privacy.title}>
          <div className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <p className="text-slate">{p.privacy.intro}</p>
            <a href={`/app/clients/${c.id}/export`} download className={buttonStyles.secondary}>
              {p.privacy.download}
            </a>
            <p className="text-sm text-slate">{p.privacy.downloadAbout}</p>
            {canDelete ? (
            <ActionForm action={eraseClient} className="space-y-3 rounded-lg bg-alert-soft p-3">
              <input type="hidden" name="clientId" value={c.id} />
              <p className="font-bold">{p.privacy.eraseTitle}</p>
              <p>{p.privacy.eraseIntro}</p>
              <label className="flex min-h-12 items-start gap-3">
                <input type="checkbox" name="confirm" className="mt-1 size-5" />
                <span>{p.privacy.eraseConfirm}</span>
              </label>
              <SubmitButton variant="danger" pendingLabel={p.privacy.erasing}>
                {p.privacy.eraseButton}
              </SubmitButton>
            </ActionForm>
            ) : (
              <p className="text-slate">{t.m.errors.codes.WB074}</p>
            )}
          </div>
        </Section>
      ) : null}

      {hidden ? null : <HidePanel action={setParentHidden} field="clientId" id={c.id} hidden={false} canManage={canManage} words={hideWords} />}
    </>
  );
}

/** The parent's own booking link (D36): copy it, send it on WhatsApp, or make a new one. */
async function RequestLink({
  t,
  org,
  client,
}: {
  t: Awaited<ReturnType<typeof getAppI18n>>;
  org: { name: string; parent_language: string; locale: string };
  client: { id: string; name: string; phone: string; token: string };
}) {
  const w = t.m.parent.requestLink;
  const url = `${await siteOrigin()}/b/${client.token}`;
  const parentWords = parentI18n(org.parent_language, org.locale).m.whatsapp;
  const message = fill(parentWords.requestLink, { parent: client.name.trim().split(/\s+/)[0] ?? client.name, kennel: org.name, url });
  return (
    <Section title={w.title}>
      <p className="mb-3 text-slate">{fill(w.about, { name: client.name })}</p>
      <div className="flex flex-wrap gap-2">
        <a href={whatsappLink(message, client.phone)} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
          {w.send}
        </a>
        <CopyButton text={url} words={t.m.copy} />
      </div>
      <ActionForm action={renewRequestLink} className="mt-3 space-y-1">
        <input type="hidden" name="clientId" value={client.id} />
        <SubmitButton variant="quiet" pendingLabel={t.m.common.saving}>
          {w.renew}
        </SubmitButton>
        <p className="text-sm text-slate">{w.renewHint}</p>
      </ActionForm>
    </Section>
  );
}

/** The day boarding packs the parent bought, and, for owners and managers, selling another (D37). */
async function Packs({
  t,
  org,
  clientId,
  canManage,
}: {
  t: Awaited<ReturnType<typeof getAppI18n>>;
  org: { id: string; currency: string; time_zone: string };
  clientId: string;
  canManage: boolean;
}) {
  const w = t.m.parent.packs;
  const supabase = await createClient();
  const [bought, forSale] = await Promise.all([
    supabase.from("pass_balances").select("pass_id, name, days, days_left, valid_until, invoice_id").eq("org_id", org.id).eq("client_id", clientId).order("valid_until", { ascending: false }),
    canManage ? supabase.from("day_packs").select("id, name").eq("org_id", org.id).eq("is_active", true).order("days") : Promise.resolve({ data: [], error: null }),
  ]);
  if (bought.error || forSale.error) throw new Error("Could not load packs.");
  if (bought.data.length === 0 && !canManage) return null;
  const today = todayIn(org.time_zone);
  return (
    <Section title={w.title} count={bought.data.length}>
      {bought.data.length === 0 ? (
        <Empty>{w.none}</Empty>
      ) : (
        <ul className="space-y-2">
          {bought.data.map((x) => (
            <li key={x.pass_id} className="flex flex-wrap items-center gap-2">
              <span>{fill(w.line, { name: x.name ?? "", left: x.days_left ?? 0, days: x.days ?? 0, until: formatDate(x.valid_until ?? today, t.locale) })}</span>
              {(x.valid_until ?? today) < today ? <Badge>{fill(w.ended, { date: formatDate(x.valid_until ?? today, t.locale) })}</Badge> : null}
              {x.invoice_id ? (
                <Link href={`/app/bills/${x.invoice_id}`} className="underline underline-offset-4">
                  {w.bill}
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canManage ? (
        forSale.data.length === 0 ? (
          <p className="mt-3 text-sm text-slate">{w.addFirst}</p>
        ) : (
          <ActionForm action={sellPack} className="mt-4 grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
            <input type="hidden" name="clientId" value={clientId} />
            <Field label={w.which}>
              <Select name="packId" required defaultValue={forSale.data[0].id}>
                {forSale.data.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.startsOn}>
              <Input name="starts_on" type="date" required defaultValue={today} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel={w.selling}>
              {w.sell}
            </SubmitButton>
          </ActionForm>
        )
      ) : null}
    </Section>
  );
}

/** Where to deliver food or pick up a pet (M25), shown while the kennel delivers. Anyone adds one; owners and managers change one. */
async function Addresses({
  t,
  org,
  clientId,
  canManage,
  canDelete,
}: {
  t: Awaited<ReturnType<typeof getAppI18n>>;
  org: { id: string; currency: string; country_code: string };
  clientId: string;
  canManage: boolean;
  canDelete: boolean;
}) {
  const { m } = t;
  const w = m.addresses;
  const supabase = await createClient();
  const [addresses, areas] = await Promise.all([
    supabase.from("client_addresses").select("id, kind, line, area, postal_code, map_url, door_note").eq("org_id", org.id).eq("client_id", clientId).order("created_at"),
    supabase.from("service_areas").select("postal_code, name, delivery_charge_minor").eq("org_id", org.id),
  ]);
  if (addresses.error || areas.error) throw new Error("Could not load addresses.");
  const charge = (minor: number | null) =>
    minor === null || minor === 0 ? m.areas.free : fill(m.areas.perDelivery, { amount: formatMoney(minor, { currency: org.currency, locale: t.locale, trimZeros: true }) });
  const numeric = org.country_code === "IN" ? "numeric" : "text";

  const fields = (x?: (typeof addresses.data)[number]) => (
    <>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={w.which}>
          <Select name="kind" defaultValue={x?.kind ?? "home"}>
            {(["home", "work", "other"] as const).map((k) => (
              <option key={k} value={k}>
                {w.kind[k]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={w.pin}>
          <Input name="postalCode" inputMode={numeric} maxLength={10} required defaultValue={x?.postal_code ?? ""} />
        </Field>
      </div>
      <Field label={w.line}>
        <Input name="line" maxLength={300} required defaultValue={x?.line ?? ""} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={w.area}>
          <Input name="area" maxLength={120} defaultValue={x?.area ?? ""} />
        </Field>
        <Field label={w.map} hint={w.mapHint}>
          <Input name="mapUrl" type="url" maxLength={500} defaultValue={x?.map_url ?? ""} autoCapitalize="none" spellCheck={false} />
        </Field>
      </div>
      <Field label={w.doorNote} hint={w.doorNoteHint}>
        <Input name="doorNote" maxLength={300} defaultValue={x?.door_note ?? ""} />
      </Field>
    </>
  );

  return (
    <Section title={w.title} count={addresses.data.length}>
      <p className="mb-3 text-slate">{w.about}</p>
      {addresses.data.length === 0 ? (
        <Empty>{w.none}</Empty>
      ) : (
        <ul className="space-y-3">
          {addresses.data.map((x) => {
            const area = areaFor(x.postal_code, areas.data);
            return (
              <li key={x.id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="font-bold">{w.kind[x.kind]}</p>
                <p>{x.line}</p>
                <p className="text-slate">{[x.area, x.postal_code].filter(Boolean).join(", ")}</p>
                <p className="mt-1">
                  {area ? <Badge tone="good">{fill(w.served, { area: area.name, charge: charge(area.delivery_charge_minor) })}</Badge> : <Badge tone="attention">{w.notServed}</Badge>}
                </p>
                {x.door_note ? <p className="mt-1 text-slate">{x.door_note}</p> : null}
                {x.map_url ? (
                  <a href={x.map_url} target="_blank" rel="noreferrer" className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
                    {w.openMap}
                  </a>
                ) : null}
                {canManage ? (
                  <details className="mt-1">
                    <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{m.common.change}</summary>
                    <ActionForm action={changeAddress} className="mt-2 space-y-4">
                      <input type="hidden" name="addressId" value={x.id} />
                      {fields(x)}
                      <SubmitButton pendingLabel={m.common.saving}>{m.common.saveChanges}</SubmitButton>
                    </ActionForm>
                    {canDelete ? (
                      <ActionForm action={removeAddress} className="mt-3">
                        <input type="hidden" name="addressId" value={x.id} />
                        <ConfirmStep label={m.common.remove} warning={m.common.cannotUndo} confirm={w.yesRemove} pending={m.common.removing} />
                      </ActionForm>
                    ) : null}
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {canManage ? null : <p className="mt-3 text-sm text-slate">{w.byManagers}</p>}
      <details className="mt-3">
        <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{w.add}</summary>
        <ActionForm action={addAddress} className="mt-2 space-y-4 rounded-xl border border-rule bg-paper p-4">
          <input type="hidden" name="clientId" value={clientId} />
          {fields()}
          <SubmitButton pendingLabel={m.common.adding}>{w.addButton}</SubmitButton>
        </ActionForm>
      </details>
    </Section>
  );
}
