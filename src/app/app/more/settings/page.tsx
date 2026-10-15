import { Suspense, type ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Loading, Notice, PageTitle, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { GST_STATES, toDecimalString } from "@/lib/core";
import { LANGUAGE_NAMES, LANGUAGES } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { saveSettings } from "./actions";

export const generateMetadata = () => appTitle((m) => m.settings.title);

/** The twelve month names in the reader's language. */
function monthNames(locale: string): string[] {
  const format = new Intl.DateTimeFormat(locale, { month: "long", timeZone: "UTC" });
  return Array.from({ length: 12 }, (_, i) => format.format(new Date(Date.UTC(2000, i, 1))));
}

/** Every time zone the runtime knows, with the kennel's own first if it is unusual. */
function timeZones(current: string): string[] {
  const all = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [];
  return all.includes(current) ? all : [current, ...all];
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Settings />
    </Suspense>
  );
}

function Group({ title, about, children }: { title: string; about?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-4">
      <legend className="px-1 text-lg font-bold">{title}</legend>
      {about ? <p className="text-slate">{about}</p> : null}
      {children}
    </fieldset>
  );
}

async function Settings() {
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const s = m.settings;
  const supabase = await createClient();
  const services = await supabase.from("services").select("kind, price_minor").eq("org_id", org.id).eq("is_default", true).eq("is_active", true);
  if (services.error) throw new Error("Could not load prices.");
  const price = (kind: string) => {
    const found = services.data.find((x) => x.kind === kind);
    return found ? toDecimalString(found.price_minor).replace(/\.00$/, "") : "";
  };

  return (
    <>
      <PageTitle title={s.title} />
      {canManage ? null : <Notice tone="info">{s.viewOnly}</Notice>}
      <ActionForm action={saveSettings} className="space-y-6">
        <Group title={s.kennel.title}>
          <Field label={s.kennel.name}>
            <Input name="name" defaultValue={org.name} required maxLength={80} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={s.kennel.phone}>
              <Input name="phone" type="tel" defaultValue={org.phone ?? ""} />
            </Field>
            <Field label={s.kennel.whatsapp} hint={s.kennel.whatsappHint}>
              <Input name="whatsapp_phone" type="tel" defaultValue={org.whatsapp_phone ?? ""} />
            </Field>
          </div>
          <Field label={s.kennel.email}>
            <Input name="email" type="email" defaultValue={org.email ?? ""} />
          </Field>
          <Field label={s.kennel.address}>
            <Input name="address_line1" defaultValue={org.address_line1 ?? ""} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={s.kennel.city}>
              <Input name="city" defaultValue={org.city ?? ""} />
            </Field>
            <Field label={s.kennel.state}>
              <Input name="state" defaultValue={org.state ?? ""} />
            </Field>
            <Field label={s.kennel.pin}>
              <Input name="postal_code" defaultValue={org.postal_code ?? ""} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={s.kennel.dropOff}>
              <Input name="check_in_time" type="time" defaultValue={org.check_in_time.slice(0, 5)} />
            </Field>
            <Field label={s.kennel.pickUp}>
              <Input name="check_out_time" type="time" defaultValue={org.check_out_time.slice(0, 5)} />
            </Field>
          </div>
        </Group>

        <Group title={s.prices.title} about={s.prices.about}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={s.prices.boarding}>
              <Input name="price_boarding" inputMode="decimal" defaultValue={price("boarding")} />
            </Field>
            <Field label={s.prices.daycare}>
              <Input name="price_daycare" inputMode="decimal" defaultValue={price("daycare")} />
            </Field>
          </div>
        </Group>

        <Group title={s.paid.title} about={s.paid.about}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={s.paid.upi} hint={s.paid.upiHint}>
              <Input name="upi_vpa" defaultValue={org.upi_vpa ?? ""} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label={s.paid.payee}>
              <Input name="upi_payee_name" defaultValue={org.upi_payee_name ?? ""} />
            </Field>
          </div>
        </Group>

        <Group title={s.tax.title} about={s.tax.about}>
          <Field label={s.tax.mode}>
            <Select name="tax_mode" defaultValue={org.tax_mode}>
              <option value="none">{s.tax.none}</option>
              <option value="gst_india">{s.tax.gst}</option>
              <option value="simple">{s.tax.simple}</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={s.tax.taxId}>
              <Input name="tax_id" defaultValue={org.tax_id ?? ""} autoCapitalize="characters" spellCheck={false} />
            </Field>
            <Field label={s.tax.gstState}>
              <Select name="gst_state_code" defaultValue={org.gst_state_code ?? ""}>
                <option value="">{s.tax.fromGstin}</option>
                {Object.entries(GST_STATES).map(([code, state]) => (
                  <option key={code} value={code}>
                    {code} {state}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={s.tax.rate}>
              <Input name="tax_rate_percent" inputMode="decimal" defaultValue={String(org.default_tax_rate_bp / 100)} />
            </Field>
            <Field label={s.tax.label} hint={s.tax.labelHint}>
              <Input name="tax_label" defaultValue={org.tax_label ?? ""} />
            </Field>
            <Field label={s.tax.legalName} hint={s.tax.legalNameHint}>
              <Input name="legal_name" defaultValue={org.legal_name ?? ""} />
            </Field>
            <Field label={s.tax.prefix} hint={s.tax.prefixHint}>
              <Input name="invoice_prefix" defaultValue={org.invoice_prefix} maxLength={4} autoCapitalize="characters" />
            </Field>
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="prices_include_tax" defaultChecked={org.prices_include_tax} className="mt-1 size-5" />
            <span>{s.tax.includesTax}</span>
          </label>
        </Group>

        <Group title={s.region.title} about={s.region.about}>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={s.region.timeZone} hint={s.region.timeZoneHint}>
              <Select name="time_zone" defaultValue={org.time_zone}>
                {timeZones(org.time_zone).map((z) => (
                  <option key={z} value={z}>
                    {z.replaceAll("_", " ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={s.region.currency} hint={s.region.currencyHint}>
              <Input name="currency" defaultValue={org.currency} maxLength={3} autoCapitalize="characters" />
            </Field>
            <Field label={s.region.locale} hint={s.region.localeHint}>
              <Input name="locale" defaultValue={org.locale} maxLength={20} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label={s.region.fiscalStart} hint={s.region.fiscalStartHint}>
              <Select name="fiscal_year_start_month" defaultValue={String(org.fiscal_year_start_month)}>
                {monthNames(locale).map((month, i) => (
                  <option key={i} value={String(i + 1)}>
                    {month}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <label className="flex min-h-12 items-start gap-3">
            <input type="checkbox" name="round_invoice_totals" defaultChecked={org.round_invoice_totals} className="mt-1 size-5" />
            <span>{s.region.round}</span>
          </label>
        </Group>

        {canManage ? (
          <Group title={m.language.title}>
            <Field label={m.language.parents} hint={m.language.parentsHint}>
              <Select name="parent_language" defaultValue={org.parent_language}>
                {LANGUAGES.map((l) => (
                  <option key={l} value={l} lang={l}>
                    {LANGUAGE_NAMES[l]}
                  </option>
                ))}
              </Select>
            </Field>
            {org.parent_language === "en" ? null : <p className="text-sm text-slate">{m.language.draftNote}</p>}
          </Group>
        ) : null}

        <Group title={s.intake.title}>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="intake_enabled" defaultChecked={org.intake_enabled} className="mt-1 size-5" />
            <span>{s.intake.enabled}</span>
          </label>
          <Field label={s.intake.notice} hint={s.intake.noticeHint}>
            <Textarea name="intake_notice" defaultValue={org.intake_notice ?? ""} maxLength={1500} />
          </Field>
        </Group>

        {canManage ? <SubmitButton pendingLabel={m.common.saving}>{s.save}</SubmitButton> : null}
      </ActionForm>
    </>
  );
}
