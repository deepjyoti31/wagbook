import { cancelSale } from "@/app/app/shop/actions";
import { formatMoney, saleSubtotal } from "@/lib/core";
import { fill } from "@/lib/i18n";
import type { I18n } from "@/lib/i18n-server";
import { shopItems } from "@/lib/shop";
import { createClient } from "@/lib/supabase/server";
import type { Messages } from "@/messages";
import { ActionForm, SubmitButton } from "./action-form";
import { SellForm } from "./sell-form";
import { Field, Input, Notice, Section } from "./ui";

/** Cancel a sale made by mistake, with a reason. Owners and managers; the database refuses one whose bill has gone out. */
export function CancelSaleForm({ id, m, back }: { id: string; m: Messages; back: string }) {
  const s = m.shop;
  return (
    <details>
      <summary className="inline-flex min-h-12 cursor-pointer items-center text-sm font-semibold underline underline-offset-4">{s.cancel}</summary>
      <ActionForm action={cancelSale} className="mt-2 flex flex-wrap items-end gap-2">
        <input type="hidden" name="saleId" value={id} />
        <input type="hidden" name="back" value={back} />
        <div className="min-w-48 flex-1">
          <Field label={s.cancelReason}>
            <Input name="reason" required maxLength={300} autoComplete="off" />
          </Field>
        </div>
        <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
          {s.cancelButton}
        </SubmitButton>
      </ActionForm>
    </details>
  );
}

/**
 * Things sold over the counter on a stay (M62): what went on its bill, and
 * the counter's form while the stay is booked or in the kennel.
 */
export async function StayShop({
  t,
  org,
  bookingId,
  open,
  canManage,
  cancelled,
}: {
  t: I18n;
  org: { id: string; currency: string };
  bookingId: string;
  open: boolean;
  canManage: boolean;
  /** A sale on it was cancelled just now (`?done=sale-cancelled`). */
  cancelled: boolean;
}) {
  const { m, locale } = t;
  const supabase = await createClient();
  const [items, sales] = await Promise.all([
    open ? shopItems(supabase, org.id) : Promise.resolve([]),
    supabase
      .from("sales")
      .select("id, status, cancel_reason, sold_on, sale_lines(description, quantity, unit_price_minor, sort_order)")
      .eq("org_id", org.id)
      .eq("booking_id", bookingId)
      .order("created_at"),
  ]);
  if (!items || sales.error) throw new Error("Could not load the shop.");
  if (!open && sales.data.length === 0) return null;
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  return (
    <Section title={m.sell.title}>
      {cancelled ? <Notice tone="ok">{m.shop.cancelledOk}</Notice> : null}
      {sales.data.length > 0 ? (
        <>
          <h3 className="mb-1 font-bold">{m.sell.soldOnStay}</h3>
          <ul className="mb-4 space-y-2">
            {sales.data.map((sale) => {
              const lines = [...sale.sale_lines].sort((a, b) => a.sort_order - b.sort_order);
              return (
                <li key={sale.id} className="rounded-xl border border-rule bg-paper p-3">
                  <p className="flex flex-wrap gap-2">
                    <span className="flex-1">{lines.map((l) => `${l.description} x ${l.quantity}`).join(", ")}</span>
                    <span className="font-semibold tabular-nums">{money(saleSubtotal(lines))}</span>
                  </p>
                  {sale.status === "cancelled" ? (
                    <p className="text-sm text-alert">{fill(m.shop.cancelled, { reason: sale.cancel_reason ?? "" })}</p>
                  ) : canManage && open ? (
                    <CancelSaleForm id={sale.id} m={m} back={`/app/bookings/${bookingId}`} />
                  ) : null}
                </li>
              );
            })}
          </ul>
        </>
      ) : null}
      {open ? <SellForm items={items} m={m} money={money} bookingId={bookingId} /> : null}
    </Section>
  );
}
