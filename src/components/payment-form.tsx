import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { recordPayment } from "@/app/app/bills/actions";
import { PAYMENT_METHODS } from "@/lib/billing";
import type { Messages } from "@/messages";

/**
 * Record money received against a bill, or as an advance on a booking. Owners and managers can also record a refund.
 * `words` is the reader's messages (m): it uses m.payments and m.labels.paymentMethod.
 */
export function PaymentForm({
  invoiceId,
  bookingId,
  defaultAmount,
  today,
  canRefund,
  words,
}: {
  invoiceId?: string;
  bookingId?: string;
  defaultAmount: string;
  today: string;
  canRefund: boolean;
  words: Pick<Messages, "payments" | "labels">;
}) {
  const w = words.payments;
  return (
    <ActionForm action={recordPayment} className="mt-4 space-y-4 rounded-xl border border-rule bg-paper p-4">
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      {bookingId ? <input type="hidden" name="bookingId" value={bookingId} /> : null}
      <p className="font-bold">{bookingId ? w.recordAdvanceTitle : w.recordPaymentTitle}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label={w.amount}>
          <Input name="amount" inputMode="decimal" required defaultValue={defaultAmount} />
        </Field>
        <Field label={w.how}>
          <Select name="method" defaultValue="upi">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {words.labels.paymentMethod[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={w.date}>
          <Input name="receivedOn" type="date" required defaultValue={today} />
        </Field>
      </div>
      <Field label={w.reference} hint={w.referenceHint}>
        <Input name="reference" maxLength={100} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <SubmitButton name="direction" value="in" pendingLabel={w.recording}>
          {bookingId ? w.recordAdvance : w.recordPayment}
        </SubmitButton>
        {canRefund ? (
          <SubmitButton name="direction" value="out" variant="quiet" pendingLabel={w.recording}>
            {w.recordRefund}
          </SubmitButton>
        ) : null}
      </div>
    </ActionForm>
  );
}
