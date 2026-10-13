import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatMoney, toDecimalString } from "@/lib/core";
import { createClient } from "@/lib/supabase/server";
import { addExtraService, changeExtraPrice, removeExtraService } from "./actions";

export const metadata: Metadata = { title: "Extras" };

export default function ExtrasPage() {
  return (
    <>
      <PageTitle title="Extras" />
      <Suspense fallback={<Loading label="Loading extras" />}>
        <Extras />
      </Suspense>
    </>
  );
}

async function Extras() {
  const { org, canManage } = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase.from("services").select("id, name, unit, price_minor").eq("org_id", org.id).eq("kind", "addon").eq("is_active", true).order("sort_order").order("name");
  if (error) throw new Error("Could not load extras.");

  return (
    <>
      <p className="mb-5 text-slate">Things you charge for on top of the stay, like grooming or pick-up. Add them to a booking from the booking page.</p>
      {canManage ? null : <Notice tone="info">You can add these to bookings, but only an owner or manager can change the list.</Notice>}

      <Section title="Your extras" count={data.length}>
        {data.length === 0 ? (
          <Empty>No extras yet.</Empty>
        ) : (
          <Ledger>
            {data.map((s) => (
              <LedgerRow key={s.id}>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{s.name}</span>{" "}
                  <span className="text-slate">
                    {formatMoney(s.price_minor, { currency: org.currency, locale: org.locale, trimZeros: true })}
                    {s.unit === "hour" ? " an hour" : ""}
                  </span>
                </span>
                {canManage ? (
                  <div className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                    <ActionForm action={changeExtraPrice} className="flex items-end gap-2">
                      <input type="hidden" name="serviceId" value={s.id} />
                      <label className="w-28">
                        <span className="sr-only">New price for {s.name}</span>
                        <Input name="price" inputMode="decimal" defaultValue={toDecimalString(s.price_minor).replace(/\.00$/, "")} />
                      </label>
                      <SubmitButton variant="secondary">Change price</SubmitButton>
                    </ActionForm>
                    <ActionForm action={removeExtraService} className="contents">
                      <input type="hidden" name="serviceId" value={s.id} />
                      <SubmitButton variant="quiet" pendingLabel="Removing">
                        Remove
                      </SubmitButton>
                    </ActionForm>
                  </div>
                ) : null}
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      {canManage ? (
        <Section title="Add an extra">
          <ActionForm action={addExtraService} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Field label="What">
                <Input name="name" required maxLength={80} placeholder="Grooming" />
              </Field>
            </div>
            <Field label="Price">
              <Input name="price" inputMode="decimal" required />
            </Field>
            <Field label="Charged">
              <Select name="unit" defaultValue="each">
                <option value="each">Each time</option>
                <option value="hour">By the hour</option>
              </Select>
            </Field>
            <SubmitButton>Add extra</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
