import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Input, Ledger, LedgerRow, Section, Select } from "@/components/ui";
import { addTrip, cancelTrip } from "@/app/app/bookings/door-actions";
import { requireOrg } from "@/lib/auth";
import { buttonStyles } from "@/components/ui";
import { formatDate, formatMoney, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { parentI18n, type I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

/**
 * A stay's pick-up from home and drop back home (M39), while the kennel
 * delivers: each with its address, time, price and whether it went, a
 * WhatsApp message telling the parent the time, and adding one.
 */
export async function StayTrips({
  t,
  booking: b,
  open,
}: {
  t: I18n;
  booking: { id: string; client_id: string; start_date: string; end_date: string; pets: { name: string } | null; clients: { full_name: string; phone: string } | null };
  open: boolean;
}) {
  const { org, canManage } = await requireOrg();
  const { m, locale } = t;
  const w = m.trips;
  const supabase = await createClient();
  const [trips, addresses] = await Promise.all([
    supabase
      .from("trips")
      .select("id, kind, trip_date, at_time, status, price_minor, cancel_reason, client_addresses(line, area, postal_code)")
      .eq("org_id", org.id)
      .eq("booking_id", b.id)
      .order("kind"),
    supabase.from("client_addresses").select("id, kind, line, area, postal_code").eq("org_id", org.id).eq("client_id", b.client_id).order("created_at"),
  ]);
  if (trips.error || addresses.error) return null;
  // A stay that is over or cancelled says nothing about trips it never had.
  if (!open && trips.data.length === 0) return null;
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  // Told to the parent in the kennel's language for parents.
  const p = parentI18n(org.parent_language, org.locale);
  const live = trips.data.filter((x) => x.status !== "cancelled");
  const missing = (["pickup", "drop"] as const).filter((k) => !live.some((x) => x.kind === k));

  return (
    <Section title={w.title} count={live.length}>
      {trips.data.length === 0 ? <p className="mb-3 text-slate">{w.none}</p> : null}
      {trips.data.length > 0 ? (
        <Ledger>
          {trips.data.map((x) => {
            const where = x.client_addresses ? [x.client_addresses.line, x.client_addresses.area, x.client_addresses.postal_code].filter(Boolean).join(", ") : "";
            const message = b.clients
              ? whatsappLink(
                  fill(p.m.trips.message[x.kind], {
                    parent: b.clients.full_name.split(" ")[0],
                    pet: b.pets?.name ?? "",
                    kennel: org.name,
                    date: formatDate(x.trip_date, p.locale),
                    time: x.at_time.slice(0, 5),
                    address: where,
                  }),
                  b.clients.phone,
                )
              : null;
            return (
              <LedgerRow key={x.id}>
                <span className="min-w-0 flex-1">
                  <span className="font-bold">{w.kinds[x.kind]}</span> {formatDate(x.trip_date, locale)}, {x.at_time.slice(0, 5)}
                  <span className="block text-sm text-slate">{where}</span>
                  {x.status === "cancelled" && x.cancel_reason ? <span className="block text-sm text-slate">{x.cancel_reason}</span> : null}
                </span>
                <span className="tabular-nums">{money(x.price_minor ?? 0)}</span>
                <Badge tone={x.status === "done" ? "good" : x.status === "cancelled" || x.status === "not_home" ? "alert" : "neutral"}>{w.statuses[x.status]}</Badge>
                {x.status === "planned" && message ? (
                  <a href={message} target="_blank" rel="noreferrer" className={`${buttonStyles.whatsapp} w-full sm:w-auto`}>
                    {w.tell}
                  </a>
                ) : null}
                {x.status === "planned" ? (
                  <details className="w-full">
                    <summary className={`${buttonStyles.quiet} cursor-pointer`}>{w.cancel}</summary>
                    <ActionForm action={cancelTrip} className="mt-2 flex flex-wrap items-end gap-2">
                      <input type="hidden" name="tripId" value={x.id} />
                      <div className="min-w-48 flex-1">
                        <Field label={w.why}>
                          <Input name="reason" required maxLength={300} />
                        </Field>
                      </div>
                      <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                        {w.cancelButton}
                      </SubmitButton>
                    </ActionForm>
                  </details>
                ) : null}
              </LedgerRow>
            );
          })}
        </Ledger>
      ) : null}
      {open && missing.length > 0 ? (
        addresses.data.length === 0 ? (
          <p className="mt-3 text-slate">{w.noAddress}</p>
        ) : (
          <ActionForm action={addTrip} className="mt-4 grid items-end gap-3 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <input type="hidden" name="bookingId" value={b.id} />
            <p className="font-bold sm:col-span-2">{w.add}</p>
            <Field label={w.kind}>
              <Select name="kind" defaultValue={missing[0]}>
                {missing.map((k) => (
                  <option key={k} value={k}>
                    {fill(w.kindOn[k], { date: formatDate(k === "pickup" ? b.start_date : b.end_date, locale) })}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.address}>
              <Select name="addressId" defaultValue={addresses.data[0].id}>
                {addresses.data.map((a) => (
                  <option key={a.id} value={a.id}>
                    {m.addresses.kind[a.kind]}: {[a.line, a.area, a.postal_code].filter(Boolean).join(", ")}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.time}>
              <Input type="time" name="time" required defaultValue="09:00" />
            </Field>
            {canManage ? (
              <Field label={w.price} hint={w.priceHint}>
                <Input name="price" inputMode="decimal" />
              </Field>
            ) : null}
            <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
              {w.addButton}
            </SubmitButton>
          </ActionForm>
        )
      ) : null}
    </Section>
  );
}
