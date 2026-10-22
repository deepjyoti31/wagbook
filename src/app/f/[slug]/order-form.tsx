"use client";

import { useActionState, useMemo, useState } from "react";
import { buttonStyles, Field, Input, Notice, Select, Textarea } from "@/components/ui";
import { coversDays, formatMoney, normalizePostalCode, packedGrams, parseKgToGrams, portionGrams, priceForGrams, sizeBand, type PortionSettings } from "@/lib/core";
import { fill } from "@/lib/i18n";
import type { Messages } from "@/messages";
import type { FoodOrderState } from "./actions";

export interface FoodForm {
  currency: string;
  locale: string;
  countryCode: string;
  packG: number;
  portions: PortionSettings;
  trial: { name: string; price_minor: number; grams: number } | null;
  subscription: { name: string; price_per_kg_minor: number } | null;
  areas: { postal_code: string; name: string; charge_minor: number }[];
}

const DAYS = [1, 2, 3, 4, 5, 6, 7] as const;

/**
 * The food order page's form (M32). Works out the portion from the dog's
 * weight and what the first week costs as the parent types, with the
 * kennel's own settings; the database works the amount out again when the
 * order is sent and that is what is asked for. Then it shows the UPI payment
 * and "I have paid".
 */
export function FoodOrderForm({
  send,
  paid,
  form,
  kennelName,
  notice,
  words,
  shared,
}: {
  send: (state: FoodOrderState, data: FormData) => Promise<FoodOrderState>;
  paid: (state: FoodOrderState, data: FormData) => Promise<FoodOrderState>;
  form: FoodForm;
  kennelName: string;
  notice: string;
  words: Messages["foodOrder"];
  shared: { slots: Messages["slots"]; weekdays: Messages["weekdays"]; bands: Messages["bands"] };
}) {
  const [state, action, pending] = useActionState(send, {});
  const [paidState, paidAction, paying] = useActionState(paid, {});
  const [kind, setKind] = useState<"trial" | "subscription">(form.subscription ? "subscription" : "trial");
  const [weight, setWeight] = useState("");
  const [plan, setPlan] = useState<"full" | "topper">("full");
  const [days, setDays] = useState<number[]>([2, 5]);
  const [pin, setPin] = useState("");
  const w = words;
  const money = (minor: number) => formatMoney(minor, { currency: form.currency, locale: form.locale, trimZeros: true });

  const grams = useMemo(() => {
    const g = parseKgToGrams(weight);
    return g && g >= 500 ? { weight: g, perDay: portionGrams({ weightG: g, plan, goal: "keep" }, form.portions) } : null;
  }, [weight, plan, form.portions]);
  const typedPin = normalizePostalCode(pin, form.countryCode);
  const area = typedPin ? (form.areas.find((a) => a.postal_code === typedPin) ?? null) : null;
  const charge = area?.charge_minor ?? 0;
  const total =
    kind === "trial"
      ? form.trial
        ? form.trial.price_minor + charge
        : null
      : grams && form.subscription && days.length > 0
        ? days.reduce((sum, d) => sum + priceForGrams(packedGrams(grams.perDay, coversDays(days, d), form.packG), form.subscription!.price_per_kg_minor) + charge, 0)
        : null;

  if (state.token) {
    return (
      <div className="space-y-4 rounded-xl border border-rule bg-paper p-6">
        <Notice tone="ok">{state.ok}</Notice>
        {state.status === "waiting_area" ? (
          <p className="text-lg">{w.waitingArea}</p>
        ) : paidState.paid ? (
          <p className="text-lg">{w.paidThanks}</p>
        ) : (
          <>
            {state.startsOn ? <p>{fill(w.firstDelivery, { date: state.startsOn })}</p> : null}
            <p className="text-2xl font-extrabold">{fill(w.payNow, { amount: state.amount ?? "" })}</p>
            {state.pay ? (
              <>
                <p className="text-slate">{w.scan}</p>
                <svg role="img" aria-label={fill(w.payNow, { amount: state.amount ?? "" })} viewBox={`0 0 ${state.pay.size} ${state.pay.size}`} className="h-56 w-56 text-ink">
                  <rect width={state.pay.size} height={state.pay.size} fill="var(--color-paper)" />
                  <path d={state.pay.d} fill="currentColor" />
                </svg>
                <a href={state.pay.link} className={buttonStyles.primary}>
                  {w.payButton}
                </a>
              </>
            ) : (
              <p>{w.noUpi}</p>
            )}
            <form action={paidAction}>
              {paidState.error ? <Notice tone="error">{paidState.error}</Notice> : null}
              <input type="hidden" name="token" value={state.token} />
              <button type="submit" disabled={paying} className={buttonStyles.secondary}>
                {w.paid}
              </button>
            </form>
          </>
        )}
      </div>
    );
  }

  return (
    <form action={action} className="space-y-6">
      {state.error ? <Notice tone="error">{state.error}</Notice> : null}
      <fieldset className="space-y-2 rounded-xl border border-rule bg-paper p-4">
        <legend className="px-1 text-lg font-bold">{w.what}</legend>
        {form.trial ? (
          <label className="flex min-h-12 items-start gap-3">
            <input type="radio" name="kind" value="trial" checked={kind === "trial"} onChange={() => setKind("trial")} className="mt-1 size-5" />
            <span>{fill(w.trial, { name: form.trial.name, grams: `${form.trial.grams / 1000} kg`, price: money(form.trial.price_minor) })}</span>
          </label>
        ) : null}
        {form.subscription ? (
          <label className="flex min-h-12 items-start gap-3">
            <input type="radio" name="kind" value="subscription" checked={kind === "subscription"} onChange={() => setKind("subscription")} className="mt-1 size-5" />
            <span>{fill(w.subscription, { price: money(form.subscription.price_per_kg_minor) })}</span>
          </label>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        <legend className="px-1 text-lg font-bold">{w.dog}</legend>
        <Field label={w.dogName}>
          <Input name="pet_name" required maxLength={80} />
        </Field>
        <Field label={w.weight}>
          <Input name="weight_kg" inputMode="decimal" required value={weight} onChange={(e) => setWeight(e.target.value)} />
        </Field>
        <Field label={w.plan}>
          <Select name="plan" value={plan} onChange={(e) => setPlan(e.target.value === "topper" ? "topper" : "full")}>
            <option value="full">{w.plans.full}</option>
            <option value="topper">{w.plans.topper}</option>
          </Select>
        </Field>
        {grams ? <p className="font-semibold">{fill(w.portion, { grams: grams.perDay, band: shared.bands[sizeBand(grams.weight, form.portions)] })}</p> : null}
        <input type="hidden" name="grams_per_day" value={grams?.perDay ?? ""} />
        {kind === "subscription" ? (
          <>
            <fieldset>
              <legend className="mb-1 font-semibold">{w.days}</legend>
              <div className="flex flex-wrap gap-x-4">
                {DAYS.map((d) => (
                  <label key={d} className="flex min-h-12 items-center gap-2">
                    <input
                      type="checkbox"
                      name={`day_${d}`}
                      checked={days.includes(d)}
                      onChange={(e) => setDays(e.target.checked ? [...days, d] : days.filter((x) => x !== d))}
                      className="size-5"
                    />
                    <span>{shared.weekdays[d]}</span>
                  </label>
                ))}
              </div>
              <p className="mt-1 text-sm text-slate">{w.daysHint}</p>
            </fieldset>
            <Field label={w.slot}>
              <Select name="slot" defaultValue="morning">
                {(["morning", "afternoon", "evening"] as const).map((s) => (
                  <option key={s} value={s}>
                    {shared.slots[s]}
                  </option>
                ))}
              </Select>
            </Field>
          </>
        ) : null}
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        <legend className="px-1 text-lg font-bold">{w.address}</legend>
        <Field label={w.line}>
          <Input name="line" required maxLength={300} autoComplete="street-address" />
        </Field>
        <Field label={w.area}>
          <Input name="area" maxLength={120} />
        </Field>
        <Field label={w.pin}>
          <Input name="postal_code" required inputMode={form.countryCode === "IN" ? "numeric" : "text"} maxLength={10} value={pin} onChange={(e) => setPin(e.target.value)} autoComplete="postal-code" />
        </Field>
        {pin.trim().length >= 6 ? area ? <p className="font-semibold text-leaf">{fill(w.served, { area: area.name })}</p> : <p className="font-semibold">{w.notServed}</p> : null}
        <Field label={w.doorNote}>
          <Input name="door_note" maxLength={300} />
        </Field>
      </fieldset>

      <fieldset className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        <legend className="px-1 text-lg font-bold">{w.you}</legend>
        <Field label={w.name}>
          <Input name="parent_name" required maxLength={120} autoComplete="name" />
        </Field>
        <Field label={w.phone} hint={w.phoneHint}>
          <Input name="phone" type="tel" required autoComplete="tel" />
        </Field>
        <Field label={w.note}>
          <Textarea name="note" rows={2} maxLength={1000} />
        </Field>
      </fieldset>

      {total !== null && (pin.trim().length < 6 || area) ? (
        <div>
          <p className="text-xl font-extrabold">{fill(kind === "trial" ? w.total : w.totalWeek, { amount: money(total) })}</p>
          <p className="text-sm text-slate">{w.totalHint}</p>
        </div>
      ) : null}

      <div className="space-y-2 rounded-xl border border-rule bg-paper p-4">
        <p className="whitespace-pre-line text-sm text-slate">{notice}</p>
        <label className="flex min-h-12 items-start gap-3">
          <input type="checkbox" name="consent" required className="mt-1 size-5" />
          <span>{fill(w.consent, { kennel: kennelName })}</span>
        </label>
        <input type="hidden" name="consent_text" value={`${notice}\n${fill(w.consent, { kennel: kennelName })}`} />
      </div>

      <button type="submit" disabled={pending} className={buttonStyles.primary}>
        {pending ? `${w.sending}…` : w.send}
      </button>
    </form>
  );
}
