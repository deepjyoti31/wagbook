import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { Badge, buttonStyles, DoorTag, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { checkIn, checkOut } from "@/app/app/actions";
import { stopRoutine } from "@/app/app/care/actions";
import { RoutineForm } from "@/components/routine-form";
import { requireOrg } from "@/lib/auth";
import { flagText, STATUS_LABEL, stayText } from "@/lib/bookings";
import { clockText } from "@/lib/care";
import {
  bookingConfirmedMessage, chargeableUnits, dailyUpdateMessage, formatDate, formatMoney, formatPhone, isOverstaying, peaksTouching, quoteStay,
  todayIn, toDecimalString, whatsappLink,
} from "@/lib/core";
import { peakPeriods, toPeak } from "@/lib/queries";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { addExtra, cancelBooking, confirmRequest, extendToToday, markNoShow, removeExtra, updateBooking } from "../actions";

export const metadata: Metadata = { title: "Booking" };

export default function BookingPage({ params, searchParams }: PageProps<"/app/bookings/[id]">) {
  return (
    <Suspense fallback={<Loading label="Loading the booking" />}>
      <Booking params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const BOOKING =
  "id, kind, status, start_date, end_date, kennel_id, public_token, rate_minor, discount_minor, tax_rate_bp, sac_code, expected_arrival, expected_departure, cancel_reason, belongings, gate_notes, vaccinations_checked_at, notes, group_id, checked_in_at, checked_out_at, pet_id, pets(id, name, breed, species, flags, food_notes, medical_notes, allergies, behaviour_notes), clients(id, full_name, phone), kennels(id, name)" as const;

async function Booking({ params, searchParams }: Pick<PageProps<"/app/bookings/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const justBooked = (await searchParams).new === "1";
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  const res = await supabase.from("bookings").select(BOOKING).eq("org_id", org.id).eq("id", id).maybeSingle();
  if (res.error) throw new Error("Could not load the booking.");
  if (!res.data) notFound();
  const b = res.data;
  const pet = b.pets;
  const parent = b.clients;

  const [items, extras, peaks, family, kennels, vaccinations, routines, origin] = await Promise.all([
    supabase.from("booking_items").select("id, description, quantity, unit_price_minor, tax_rate_bp, sac_code").eq("org_id", org.id).eq("booking_id", b.id).order("created_at"),
    supabase.from("services").select("id, name, price_minor").eq("org_id", org.id).eq("kind", "addon").eq("is_active", true).order("sort_order").order("name"),
    peakPeriods(supabase, org.id, b.start_date, b.end_date),
    b.group_id
      ? supabase.from("bookings").select("id, status, pets(name)").eq("org_id", org.id).eq("group_id", b.group_id).neq("id", b.id)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("available_kennels", { p_org: org.id, p_kind: b.kind, p_start: b.start_date, p_end: b.end_date }),
    supabase.from("vaccinations").select("id, vaccine, valid_until").eq("org_id", org.id).eq("pet_id", b.pet_id).order("vaccine"),
    supabase.from("care_items").select("id, kind, label, details, due_time").eq("org_id", org.id).eq("pet_id", b.pet_id).eq("is_active", true).order("due_time"),
    siteOrigin(),
  ]);
  if (items.error || extras.error || peaks.error || family.error || vaccinations.error || routines.error) throw new Error("Could not load the booking.");

  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale: org.locale, trimZeros: true });
  const open = b.status === "requested" || b.status === "confirmed" || b.status === "checked_in";
  const touching = peaksTouching({ kind: b.kind, startDate: b.start_date, endDate: b.end_date }, (peaks.data ?? []).map(toPeak));
  const noRefund = touching.filter((p) => p.noRefund);
  const overstay = isOverstaying({ status: b.status, endDate: b.end_date }, today);
  const stayUrl = `${origin}/s/${b.public_token}`;
  const freeKennels = [...(b.kennels ? [{ id: b.kennels.id, name: b.kennels.name }] : []), ...(kennels.data ?? []).filter((k) => k.id !== b.kennel_id)];

  const quote = quoteStay(
    {
      kind: b.kind,
      petName: pet?.name ?? "Pet",
      startDate: b.start_date,
      endDate: b.end_date,
      rateMinor: b.rate_minor,
      discountMinor: b.discount_minor,
      taxRateBp: b.tax_rate_bp,
      addOns: items.data.map((i) => ({ description: i.description, quantity: Number(i.quantity), unitPriceMinor: i.unit_price_minor, taxRateBp: i.tax_rate_bp })),
    },
    { mode: org.tax_mode, sellerStateCode: org.gst_state_code, placeOfSupplyStateCode: org.gst_state_code, pricesIncludeTax: org.prices_include_tax },
    { roundToWholeUnit: org.round_invoice_totals },
  );
  const units = chargeableUnits(b.kind, b.start_date, b.end_date);
  const confirmation = parent
    ? whatsappLink(
        bookingConfirmedMessage({
          kennelName: org.name,
          parentName: parent.full_name,
          petName: pet?.name ?? "your pet",
          startDate: b.start_date,
          endDate: b.end_date,
          nights: units,
          totalMinor: quote.totalMinor,
          currency: org.currency,
          stayUrl,
        }),
        parent.phone,
      )
    : null;

  return (
    <>
      <PageTitle title={pet?.name ?? "Booking"}>
        <Link href="/app/bookings" className={buttonStyles.quiet}>
          All bookings
        </Link>
      </PageTitle>

      <div className="mb-5 space-y-2">
        <p className="flex flex-wrap items-center gap-2">
          <DoorTag name={b.kennels?.name} />
          <Badge tone={b.status === "checked_in" ? "good" : b.status === "requested" ? "attention" : "neutral"}>{STATUS_LABEL[b.status]}</Badge>
          {b.kind === "daycare" ? <Badge>Day boarding</Badge> : null}
          {overstay ? <Badge tone="alert">Was due to leave {formatDate(b.end_date)}</Badge> : null}
          {touching.map((p) => (
            <Badge key={p.name} tone="attention">
              {p.name}
              {p.noRefund ? ", no refund" : ""}
            </Badge>
          ))}
          {(pet?.flags ?? []).map((f) => (
            <Badge key={f} tone="alert">
              {flagText(f)}
            </Badge>
          ))}
        </p>
        <p className="text-lg">{stayText(b.kind, b.start_date, b.end_date)}</p>
        {parent ? (
          <p className="text-slate">
            {parent.full_name},{" "}
            <a href={`tel:${parent.phone}`} className="underline underline-offset-4">
              {formatPhone(parent.phone)}
            </a>
          </p>
        ) : null}
        {b.cancel_reason && b.status === "cancelled" ? <p className="text-slate">Cancelled: {b.cancel_reason}</p> : null}
      </div>

      {justBooked ? (
        <Notice tone="ok">
          {b.status === "requested" ? "Saved as a request. It holds no space until you confirm it." : "Booked."}
          {family.data.length > 0 ? ` ${family.data.length + 1} pets booked together.` : ""}
        </Notice>
      ) : null}

      {open ? (
        <Section title="Next">
          <NextStep
            booking={b}
            today={today}
            overstay={overstay}
            freeKennels={freeKennels}
            vaccinations={vaccinations.data}
            stayEnds={b.end_date}
            updateLink={
              parent && b.status === "checked_in"
                ? whatsappLink(dailyUpdateMessage({ petName: pet?.name ?? "Your pet", note: "", stayUrl }), parent.phone)
                : null
            }
          />
        </Section>
      ) : null}

      {b.status !== "cancelled" && b.status !== "no_show" ? (
        <Section title="Parent's stay page">
          <p className="mb-3 break-all text-slate">{stayUrl}</p>
          <div className="flex flex-wrap gap-2">
            {confirmation && b.status !== "requested" ? (
              <a href={confirmation} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
                Send confirmation
              </a>
            ) : null}
            <CopyButton text={stayUrl} />
            <a href={stayUrl} target="_blank" rel="noreferrer" className={buttonStyles.quiet}>
              Open it
            </a>
          </div>
        </Section>
      ) : null}

      {family.data.length > 0 ? (
        <Section title="Booked together" count={family.data.length}>
          <Ledger>
            {family.data.map((f) => (
              <li key={f.id}>
                <Link href={`/app/bookings/${f.id}`} className="flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-ground">
                  <span className="font-bold">{f.pets?.name ?? "Pet"}</span>
                  <Badge>{STATUS_LABEL[f.status]}</Badge>
                </Link>
              </li>
            ))}
          </Ledger>
        </Section>
      ) : null}

      <Section title="What it costs">
        <Ledger>
          {quote.lines.map((l, i) => (
            <LedgerRow key={i}>
              <span className="min-w-0 flex-1">
                {i === 0 ? `${b.kind === "boarding" ? "Boarding" : "Day boarding"}, ${l.quantity} x ${money(l.unitPriceMinor)}` : `${l.description}, ${l.quantity} x ${money(l.unitPriceMinor)}`}
                {l.discountMinor > 0 ? `, less ${money(l.discountMinor)}` : ""}
              </span>
              <span className="font-semibold">{money(l.totalMinor)}</span>
              {i > 0 && canManage && open ? (
                <ActionForm action={removeExtra} className="contents">
                  <input type="hidden" name="itemId" value={items.data[i - 1].id} />
                  <SubmitButton variant="quiet" pendingLabel="Removing">
                    Remove
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </LedgerRow>
          ))}
          <LedgerRow>
            <span className="flex-1 font-bold">Estimated total{quote.taxMinor > 0 ? `, with ${money(quote.taxMinor)} tax` : ""}</span>
            <span className="text-lg font-extrabold">{money(quote.totalMinor)}</span>
          </LedgerRow>
        </Ledger>
        <p className="mt-2 text-sm text-slate">An estimate. The bill is made at check-out.</p>

        {open ? (
          <ActionForm action={addExtra} className="mt-4 space-y-4 rounded-xl border border-rule bg-paper p-4">
            <input type="hidden" name="bookingId" value={b.id} />
            <p className="font-bold">Add an extra</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="From your price list">
                  <Select name="serviceId" defaultValue="">
                    <option value="">Something else (describe it below)</option>
                    {extras.data.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name}, {money(s.price_minor)}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label="How many">
                <Input name="quantity" inputMode="decimal" defaultValue="1" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label="Or describe it" hint="For a one-off, like a vet bill paid for the parent.">
                  <Input name="description" maxLength={200} />
                </Field>
              </div>
              <Field label="Price">
                <Input name="price" inputMode="decimal" />
              </Field>
            </div>
            <SubmitButton variant="secondary" pendingLabel="Adding">
              Add extra
            </SubmitButton>
            {extras.data.length === 0 && canManage ? (
              <p className="text-sm text-slate">
                Add grooming and other extras to your price list on{" "}
                <Link href="/app/more/extras" className="underline underline-offset-4">
                  Extras
                </Link>
                .
              </p>
            ) : null}
          </ActionForm>
        ) : null}
      </Section>

      {open ? (
        <Section title="Change this booking">
          <ActionForm action={updateBooking} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <input type="hidden" name="bookingId" value={b.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={b.kind === "daycare" ? "First day" : "Check-in date"}>
                <Input name="startDate" type="date" required defaultValue={b.start_date} />
              </Field>
              <Field label={b.kind === "daycare" ? "Last day" : "Check-out date"}>
                <Input name="endDate" type="date" required defaultValue={b.end_date} />
              </Field>
            </div>
            <Field label="Kennel" hint="Free for these dates. To move dates and kennel together, change both and save.">
              <Select name="kennelId" defaultValue={b.kennel_id ?? ""}>
                <option value="">{b.status === "checked_in" ? "No kennel" : "Decide at check-in"}</option>
                {freeKennels.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Expected drop-off time">
                <Input name="expectedArrival" type="time" defaultValue={b.expected_arrival?.slice(0, 5) ?? ""} />
              </Field>
              <Field label="Expected pick-up time">
                <Input name="expectedDeparture" type="time" defaultValue={b.expected_departure?.slice(0, 5) ?? ""} />
              </Field>
            </div>
            {canManage ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={b.kind === "boarding" ? "Price per night" : "Price per day"}>
                  <Input name="rate" inputMode="decimal" required defaultValue={toDecimalString(b.rate_minor).replace(/\.00$/, "")} />
                </Field>
                <Field label="Discount on the stay" hint="Taken off the whole stay, before tax.">
                  <Input name="discount" inputMode="decimal" defaultValue={b.discount_minor ? toDecimalString(b.discount_minor).replace(/\.00$/, "") : ""} />
                </Field>
              </div>
            ) : (
              <p className="text-slate">
                {money(b.rate_minor)} {b.kind === "boarding" ? "a night" : "a day"}. Only an owner or manager can change the price.
              </p>
            )}
            <Field label="Belongings" hint="Bed, leash, food, medicines. So it all goes home again.">
              <Textarea name="belongings" maxLength={2000} defaultValue={b.belongings ?? ""} />
            </Field>
            <Field label="Notes for staff">
              <Textarea name="notes" maxLength={2000} defaultValue={b.notes ?? ""} />
            </Field>
            <SubmitButton>Save changes</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {pet ? (
        <Section title={`${pet.name}'s own routines`} count={routines.data.length}>
          {routines.data.length === 0 ? (
            <Empty>None. Add a medicine or a special meal that has to happen at a set time.</Empty>
          ) : (
            <Ledger>
              {routines.data.map((r) => (
                <LedgerRow key={r.id}>
                  <span className="min-w-0 flex-1">
                    <span className="font-bold">{clockText(r.due_time)}</span> {r.label}
                    {r.kind === "medication" ? (
                      <>
                        {" "}
                        <Badge tone="alert">Medicine</Badge>
                      </>
                    ) : null}
                    {r.details ? <span className="block text-slate">{r.details}</span> : null}
                  </span>
                  <ActionForm action={stopRoutine} className="contents">
                    <input type="hidden" name="routineId" value={r.id} />
                    <SubmitButton variant="quiet" pendingLabel="Stopping">
                      Stop
                    </SubmitButton>
                  </ActionForm>
                </LedgerRow>
              ))}
            </Ledger>
          )}
          <RoutineForm petId={pet.id} />
        </Section>
      ) : null}

      {pet && (pet.food_notes || pet.medical_notes || pet.allergies || pet.behaviour_notes) ? (
        <Section title={`About ${pet.name}`}>
          <dl className="space-y-3 rounded-xl border border-rule bg-paper p-4">
            <About label="Food">{pet.food_notes}</About>
            <About label="Health and medicines" alert>
              {pet.medical_notes}
            </About>
            <About label="Allergies" alert>
              {pet.allergies}
            </About>
            <About label="Behaviour">{pet.behaviour_notes}</About>
          </dl>
        </Section>
      ) : null}

      {b.status === "requested" || b.status === "confirmed" ? (
        <Section title="Cancel">
          {noRefund.length > 0 ? (
            <Notice tone="info">
              This stay touches {noRefund.map((p) => p.name).join(" and ")}, which you do not refund. Tell the parent before cancelling.
            </Notice>
          ) : null}
          <ActionForm action={cancelBooking} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <input type="hidden" name="bookingId" value={b.id} />
            <Field label="Why is it cancelled?">
              <Input name="reason" required maxLength={500} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel="Cancelling">
              Cancel booking
            </SubmitButton>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}

function About({ label, alert, children }: { label: string; alert?: boolean; children: ReactNode }) {
  if (!children) return null;
  return (
    <div>
      <dt className="font-semibold">{label}</dt>
      <dd className={alert ? "font-semibold text-alert" : "text-ink"}>{children}</dd>
    </div>
  );
}

type NextBooking = { id: string; status: string; kennel_id: string | null; belongings: string | null; gate_notes: string | null; vaccinations_checked_at: string | null };

function NextStep({
  booking: b,
  today,
  overstay,
  freeKennels,
  vaccinations,
  stayEnds,
  updateLink,
}: {
  booking: NextBooking;
  today: string;
  overstay: boolean;
  freeKennels: { id: string; name: string }[];
  vaccinations: { id: string; vaccine: string; valid_until: string | null }[];
  stayEnds: string;
  updateLink: string | null;
}) {
  if (b.status === "requested") {
    return (
      <ActionForm action={confirmRequest} className="space-y-3">
        <input type="hidden" name="bookingId" value={b.id} />
        <p>This is a request. It holds no space until you confirm it.</p>
        <SubmitButton pendingLabel="Confirming">Confirm booking</SubmitButton>
      </ActionForm>
    );
  }

  if (b.status === "checked_in") {
    return (
      <div className="flex flex-wrap gap-2">
        {overstay ? (
          <ActionForm action={extendToToday} className="w-full">
            <input type="hidden" name="bookingId" value={b.id} />
            <p className="mb-2">Still here after {formatDate(stayEnds)}? Extend the stay so the kennel stays held.</p>
            <SubmitButton pendingLabel="Extending">Extend to today</SubmitButton>
          </ActionForm>
        ) : null}
        {updateLink ? (
          <a href={updateLink} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
            Send update
          </a>
        ) : null}
        <ActionForm action={checkOut} className="contents">
          <input type="hidden" name="bookingId" value={b.id} />
          <SubmitButton pendingLabel="Checking out" variant={stayEnds <= today ? "primary" : "secondary"}>
            Check out
          </SubmitButton>
        </ActionForm>
      </div>
    );
  }

  // Confirmed: check in with the checklist, or record that the pet did not come.
  return (
    <div className="space-y-4">
      <ActionForm action={checkIn} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
        <input type="hidden" name="bookingId" value={b.id} />
        <input type="hidden" name="checklist" value="1" />
        <p className="font-bold">Check-in checklist</p>
        <Field label="Kennel">
          <Select name="kennelId" defaultValue={b.kennel_id ?? ""}>
            <option value="">No kennel yet</option>
            {freeKennels.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-1 font-semibold">Vaccinations</p>
          {vaccinations.length === 0 ? (
            <p className="text-slate">None on record. Look at the certificates and note them below.</p>
          ) : (
            <ul className="mb-2 space-y-1">
              {vaccinations.map((v) => {
                const lapsed = v.valid_until !== null && v.valid_until < stayEnds;
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-2">
                    <span>{v.vaccine.replaceAll("_", " ")}</span>
                    {v.valid_until ? (
                      <Badge tone={lapsed ? "alert" : "good"}>
                        {v.valid_until < today ? "Expired" : lapsed ? "Runs out during the stay" : "Valid"} until {formatDate(v.valid_until)}
                      </Badge>
                    ) : (
                      <Badge tone="attention">No expiry date</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" name="vaccinationsChecked" defaultChecked={b.vaccinations_checked_at !== null} className="size-5" />
            <span>I have seen the vaccination certificates</span>
          </label>
        </div>
        <Field label="Belongings" hint="Bed, leash, food, medicines.">
          <Textarea name="belongings" maxLength={2000} defaultValue={b.belongings ?? ""} />
        </Field>
        <Field label="Anything said at the gate" hint="A change of food, a recent illness, who will collect.">
          <Textarea name="gateNotes" maxLength={2000} defaultValue={b.gate_notes ?? ""} />
        </Field>
        <SubmitButton pendingLabel="Checking in">Check in</SubmitButton>
      </ActionForm>
      <ActionForm action={markNoShow} className="contents">
        <input type="hidden" name="bookingId" value={b.id} />
        <SubmitButton variant="quiet" pendingLabel="Saving">
          Did not arrive
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
