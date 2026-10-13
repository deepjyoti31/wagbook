import type { Metadata } from "next";
import { Suspense, type ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Loading, Notice, PageTitle, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { GST_STATES, toDecimalString } from "@/lib/core";
import { createClient } from "@/lib/supabase/server";
import { saveSettings } from "./actions";

export const metadata: Metadata = { title: "Settings" };

export default function SettingsPage() {
  return (
    <>
      <PageTitle title="Settings" />
      <Suspense fallback={<Loading label="Loading settings" />}>
        <Settings />
      </Suspense>
    </>
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
  const supabase = await createClient();
  const services = await supabase.from("services").select("kind, price_minor").eq("org_id", org.id).eq("is_default", true).eq("is_active", true);
  if (services.error) throw new Error("Could not load prices.");
  const price = (kind: string) => {
    const s = services.data.find((x) => x.kind === kind);
    return s ? toDecimalString(s.price_minor).replace(/\.00$/, "") : "";
  };

  return (
    <>
      {canManage ? null : <Notice tone="info">You can look, but only an owner or manager can change settings.</Notice>}
      <ActionForm action={saveSettings} className="space-y-6">
        <Group title="Your kennel">
          <Field label="Kennel name">
            <Input name="name" defaultValue={org.name} required maxLength={80} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Phone">
              <Input name="phone" type="tel" defaultValue={org.phone ?? ""} />
            </Field>
            <Field label="WhatsApp number" hint="Shown to parents on their stay page.">
              <Input name="whatsapp_phone" type="tel" defaultValue={org.whatsapp_phone ?? ""} />
            </Field>
          </div>
          <Field label="Email">
            <Input name="email" type="email" defaultValue={org.email ?? ""} />
          </Field>
          <Field label="Address">
            <Input name="address_line1" defaultValue={org.address_line1 ?? ""} />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="City">
              <Input name="city" defaultValue={org.city ?? ""} />
            </Field>
            <Field label="State">
              <Input name="state" defaultValue={org.state ?? ""} />
            </Field>
            <Field label="PIN code">
              <Input name="postal_code" defaultValue={org.postal_code ?? ""} />
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Earliest drop-off">
              <Input name="check_in_time" type="time" defaultValue={org.check_in_time.slice(0, 5)} />
            </Field>
            <Field label="Latest pick-up">
              <Input name="check_out_time" type="time" defaultValue={org.check_out_time.slice(0, 5)} />
            </Field>
          </div>
        </Group>

        <Group title="Prices" about="Filled in for you on every new booking. You can still change the price on any one booking.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Boarding, per night">
              <Input name="price_boarding" inputMode="decimal" defaultValue={price("boarding")} />
            </Field>
            <Field label="Day boarding, per day">
              <Input name="price_daycare" inputMode="decimal" defaultValue={price("daycare")} />
            </Field>
          </div>
        </Group>

        <Group title="Getting paid" about="Wagbook puts your UPI ID into a pay link on every bill. The money goes straight to your bank; Wagbook never touches it.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="UPI ID" hint="Like name@bank.">
              <Input name="upi_vpa" defaultValue={org.upi_vpa ?? ""} autoCapitalize="none" spellCheck={false} />
            </Field>
            <Field label="Name shown to the payer">
              <Input name="upi_payee_name" defaultValue={org.upi_payee_name ?? ""} />
            </Field>
          </div>
        </Group>

        <Group title="Tax and invoices" about="Ask your accountant before changing these. Until you are registered for tax, leave tax off.">
          <Field label="Tax">
            <Select name="tax_mode" defaultValue={org.tax_mode}>
              <option value="none">I do not charge tax</option>
              <option value="gst_india">India GST (CGST and SGST, or IGST)</option>
              <option value="simple">One tax at one rate (VAT or sales tax)</option>
            </Select>
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="GSTIN or tax number">
              <Input name="tax_id" defaultValue={org.tax_id ?? ""} autoCapitalize="characters" spellCheck={false} />
            </Field>
            <Field label="State, for GST">
              <Select name="gst_state_code" defaultValue={org.gst_state_code ?? ""}>
                <option value="">Take it from the GSTIN</option>
                {Object.entries(GST_STATES).map(([code, state]) => (
                  <option key={code} value={code}>
                    {code} {state}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Tax rate, percent">
              <Input name="tax_rate_percent" inputMode="decimal" defaultValue={String(org.default_tax_rate_bp / 100)} />
            </Field>
            <Field label="Name of the tax" hint="Only for the one-rate option, like VAT.">
              <Input name="tax_label" defaultValue={org.tax_label ?? ""} />
            </Field>
            <Field label="Legal name" hint="Printed on invoices if different from the kennel name.">
              <Input name="legal_name" defaultValue={org.legal_name ?? ""} />
            </Field>
            <Field label="Invoice prefix" hint="WB gives invoice numbers like WB/27-28/0001.">
              <Input name="invoice_prefix" defaultValue={org.invoice_prefix} maxLength={4} autoCapitalize="characters" />
            </Field>
          </div>
          <label className="flex items-start gap-3">
            <input type="checkbox" name="prices_include_tax" defaultChecked={org.prices_include_tax} className="mt-1 size-5" />
            <span>My prices already include tax</span>
          </label>
        </Group>

        <Group title="Solo play" about="For kennels where every pet gets a yard to itself. Set sessions to 0 if you do not schedule play.">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Sessions for each pet, per day">
              <Input name="play_sessions_per_day" type="number" min={0} max={12} defaultValue={org.play_sessions_per_day} />
            </Field>
            <Field label="Minutes per session">
              <Input name="play_session_minutes" type="number" min={5} max={240} defaultValue={org.play_session_minutes} />
            </Field>
          </div>
        </Group>

        <Group title="Intake form">
          <label className="flex items-start gap-3">
            <input type="checkbox" name="intake_enabled" defaultChecked={org.intake_enabled} className="mt-1 size-5" />
            <span>Parents can send me their pet&apos;s details through my intake link</span>
          </label>
          <Field label="Consent wording" hint="What parents agree to when they submit the form. Leave empty to use Wagbook's standard wording.">
            <Textarea name="intake_notice" defaultValue={org.intake_notice ?? ""} maxLength={1500} />
          </Field>
        </Group>

        {canManage ? <SubmitButton>Save settings</SubmitButton> : null}
      </ActionForm>
    </>
  );
}
