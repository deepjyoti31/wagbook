import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Ledger, LedgerRow, Notice, Section, Select } from "@/components/ui";
import { settleCancellation } from "@/app/app/bookings/door-actions";
import { requireOrg } from "@/lib/auth";
import { PAYMENT_METHODS } from "@/lib/billing";
import { cancelledStayOutcome } from "@/lib/cancellation";
import { formatDate, formatMoney } from "@/lib/core";
import { fill } from "@/lib/i18n";
import type { I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * A cancelled stay's advance, night by night (M38): what the kennel's rules
 * make of each night, and the refund and credit an owner or manager confirms
 * in one step. Shown while an advance is still held for the stay.
 */
export async function StayCancellation({ t, bookingId, choice, settled }: { t: I18n; bookingId: string; choice: "refund" | "credit" | null; settled: boolean }) {
  const { org, canManage } = await requireOrg();
  const { m, locale } = t;
  const w = m.cancelRules;
  const supabase = await createClient();
  const worked = await cancelledStayOutcome(supabase, org, bookingId, choice);
  if (!worked) return null;
  const { result: r, byKennel } = worked;
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const paid = r.refundMinor + r.creditMinor + r.keptMinor;
  if (paid <= 0 && !settled) return null;

  return (
    <Section title={w.title}>
      {settled ? <Notice tone="ok">{w.settled}</Notice> : null}
      {paid > 0 ? (
        <>
          <p className="mb-3 text-slate">{byKennel ? w.byKennelAbout : w.about}</p>
          <Ledger>
            {r.nights.map((n) => (
              <LedgerRow key={n.date}>
                <span className="min-w-0 flex-1">
                  {formatDate(n.date, locale)}
                  <span className="block text-sm text-slate">
                    {[n.weekend ? w.weekend : w.weekday, byKennel ? w.kennelCancelled : n.onTime ? w.onTime : w.late].join(", ")}
                  </span>
                </span>
                <span className="tabular-nums">{money(n.priceMinor)}</span>
                <Badge tone={n.outcome === "refund" ? "good" : n.outcome === "credit" ? "attention" : "neutral"}>{w.outcomes[n.outcome]}</Badge>
              </LedgerRow>
            ))}
          </Ledger>
          <p className="mt-3 font-semibold">{fill(w.summary, { paid: money(paid), refund: money(r.refundMinor), credit: money(r.creditMinor), kept: money(r.keptMinor) })}</p>
          {canManage && r.refundMinor + r.creditMinor > 0 ? (
            <ActionForm action={settleCancellation} className="mt-3 grid items-end gap-3 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
              <input type="hidden" name="bookingId" value={bookingId} />
              {byKennel ? (
                <Field label={w.parentChose}>
                  <Select name="choice" defaultValue={choice ?? "refund"}>
                    <option value="refund">{w.chooseRefund}</option>
                    <option value="credit">{w.chooseCredit}</option>
                  </Select>
                </Field>
              ) : null}
              {r.refundMinor > 0 || byKennel ? (
                <Field label={w.refundHow}>
                  <Select name="method" defaultValue="upi">
                    {PAYMENT_METHODS.map((x) => (
                      <option key={x} value={x}>
                        {m.labels.paymentMethod[x]}
                      </option>
                    ))}
                  </Select>
                </Field>
              ) : null}
              <SubmitButton pendingLabel={m.common.saving}>{byKennel
                  ? w.confirmChoice
                  : fill(r.creditMinor === 0 ? w.confirmRefund : r.refundMinor === 0 ? w.confirmCredit : w.confirmBoth, { refund: money(r.refundMinor), credit: money(r.creditMinor) })}</SubmitButton>
            </ActionForm>
          ) : !canManage ? (
            <p className="mt-2 text-sm text-slate">{w.managersConfirm}</p>
          ) : null}
        </>
      ) : null}
    </Section>
  );
}
