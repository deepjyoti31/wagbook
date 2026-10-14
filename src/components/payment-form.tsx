import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Select } from "@/components/ui";
import { recordPayment } from "@/app/app/bills/actions";
import { PAYMENT_METHOD_LABEL, PAYMENT_METHODS } from "@/lib/billing";

/** Record money received against a bill, or as an advance on a booking. Owners and managers can also record a refund. */
export function PaymentForm({ invoiceId, bookingId, defaultAmount, today, canRefund }: { invoiceId?: string; bookingId?: string; defaultAmount: string; today: string; canRefund: boolean }) {
  return (
    <ActionForm action={recordPayment} className="mt-4 space-y-4 rounded-xl border border-rule bg-paper p-4">
      {invoiceId ? <input type="hidden" name="invoiceId" value={invoiceId} /> : null}
      {bookingId ? <input type="hidden" name="bookingId" value={bookingId} /> : null}
      <p className="font-bold">{bookingId ? "Record an advance" : "Record a payment"}</p>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Amount">
          <Input name="amount" inputMode="decimal" required defaultValue={defaultAmount} />
        </Field>
        <Field label="How">
          <Select name="method" defaultValue="upi">
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {PAYMENT_METHOD_LABEL[m]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Date">
          <Input name="receivedOn" type="date" required defaultValue={today} />
        </Field>
      </div>
      <Field label="Reference" hint="The UPI transaction number (UTR), to match your bank statement.">
        <Input name="reference" maxLength={100} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <SubmitButton name="direction" value="in" pendingLabel="Recording">
          {bookingId ? "Record advance" : "Record payment"}
        </SubmitButton>
        {canRefund ? (
          <SubmitButton name="direction" value="out" variant="quiet" pendingLabel="Recording">
            Record as a refund
          </SubmitButton>
        ) : null}
      </div>
    </ActionForm>
  );
}
