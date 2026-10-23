import { sellItems } from "@/app/app/shop/actions";
import { fill } from "@/lib/i18n";
import type { ShopItem } from "@/lib/shop";
import type { Messages } from "@/messages";
import { ActionForm, SubmitButton } from "./action-form";
import { Empty, Field, Input, Select } from "./ui";

/**
 * The counter's form (M62): how many of each thing for sale, and where the
 * sale goes. Used by the shop for walk-ins, by the parent page and by the
 * stay page. A thing with none in stock is shown but cannot be typed into;
 * more than is in stock is refused by the database, in its own sentence.
 */
export function SellForm({
  items,
  m,
  money,
  clientId,
  bookingId,
  stays,
  button,
}: {
  items: readonly ShopItem[];
  m: Messages;
  money: (minor: number) => string;
  /** Selling to this parent. Neither this nor bookingId: the walk-in buyer. */
  clientId?: string;
  /** Selling on this stay's bill. */
  bookingId?: string;
  /** The parent's stays a sale may go on, offered with "A bill of its own". */
  stays?: readonly { id: string; label: string }[];
  button?: string;
}) {
  const s = m.sell;
  if (items.length === 0) return <Empty>{s.noItems}</Empty>;
  return (
    <ActionForm action={sellItems} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
      <p className="text-sm text-slate">{s.about}</p>
      {clientId ? <input type="hidden" name="clientId" value={clientId} /> : null}
      {bookingId ? <input type="hidden" name="putOn" value={bookingId} /> : null}
      <ul className="divide-y divide-rule">
        {items.map((i) => (
          <li key={i.item_id} className="flex flex-wrap items-center gap-3 py-2">
            <label htmlFor={`qty-${i.item_id}`} className="min-w-40 flex-1">
              <span className="block font-semibold">{i.name}</span>
              <span className="block text-sm text-slate">{fill(s.each, { price: money(i.sell_price_minor), n: i.on_hand })}</span>
            </label>
            <div className="w-24">
              <Input
                id={`qty-${i.item_id}`}
                name={`qty-${i.item_id}`}
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                placeholder="0"
                aria-label={`${s.howMany}: ${i.name}`}
                disabled={i.on_hand <= 0}
              />
            </div>
          </li>
        ))}
      </ul>
      {stays && stays.length > 0 && !bookingId ? (
        <Field label={s.putOn}>
          <Select name="putOn" defaultValue={stays[0].id}>
            {stays.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
            <option value="own">{s.ownBill}</option>
          </Select>
        </Field>
      ) : null}
      <SubmitButton pendingLabel={s.selling}>{button ?? s.button}</SubmitButton>
    </ActionForm>
  );
}
