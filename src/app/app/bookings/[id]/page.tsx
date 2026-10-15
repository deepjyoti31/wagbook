import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense, type ReactNode } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { Badge, buttonStyles, DoorTag, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { Rich } from "@/components/rich";
import { checkIn, checkOut } from "@/app/app/actions";
import { stopRoutine } from "@/app/app/care/actions";
import { PaymentForm } from "@/components/payment-form";
import { PetAvatar } from "@/components/pet-avatar";
import { VaccinationList, VaccinationWarnings } from "@/components/pet-panels";
import { signedUrls } from "@/lib/media";
import { RoutineForm } from "@/components/routine-form";
import { makeBill } from "@/app/app/bills/actions";
import { requireOrg } from "@/lib/auth";
import { flagText, stayText } from "@/lib/bookings";
import { clockText } from "@/lib/care";
import {
  bookingConfirmedMessage, chargeableUnits, formatDate, formatMoney, formatPhone, isOverstaying, peaksTouching, quoteStay,
  todayIn, toDecimalString, vaccinationWarnings, whatsappLink,
} from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n, type I18n } from "@/lib/i18n-server";
import { peakPeriods, toPeak } from "@/lib/queries";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { addExtra, cancelBooking, confirmRequest, extendToToday, markNoShow, removeExtra, updateBooking } from "../actions";

export const generateMetadata = () => appTitle((m) => m.booking.title);

export default function BookingPage({ params, searchParams }: PageProps<"/app/bookings/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Booking params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const BOOKING =
  "id, kind, status, start_date, end_date, kennel_id, public_token, rate_minor, discount_minor, tax_rate_bp, sac_code, expected_arrival, expected_departure, cancel_reason, belongings, gate_notes, vaccinations_checked_at, notes, group_id, checked_in_at, checked_out_at, pet_id, pets(id, name, breed, species, flags, food_notes, medical_notes, allergies, behaviour_notes, photo_path), clients(id, full_name, phone), kennels(id, name)" as const;

async function Booking({ params, searchParams }: Pick<PageProps<"/app/bookings/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  const justBooked = query.new === "1";
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const w = m.booking;
  // What to say after a step that changes the booking's status (see moveStatus in ../actions.ts).
  const done = typeof query.done === "string" && query.done in w.done ? w.done[query.done as keyof typeof w.done] : null;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  const res = await supabase.from("bookings").select(BOOKING).eq("org_id", org.id).eq("id", id).maybeSingle();
  if (res.error) throw new Error("Could not load the booking.");
  if (!res.data) notFound();
  const b = res.data;
  const pet = b.pets;
  const parent = b.clients;

  const [items, extras, peaks, family, kennels, vaccinations, routines, bill, advances, updates, origin] = await Promise.all([
    supabase.from("booking_items").select("id, description, quantity, unit_price_minor, tax_rate_bp, sac_code").eq("org_id", org.id).eq("booking_id", b.id).order("created_at"),
    supabase.from("services").select("id, name, price_minor").eq("org_id", org.id).eq("kind", "addon").eq("is_active", true).order("sort_order").order("name"),
    peakPeriods(supabase, org.id, b.start_date, b.end_date),
    b.group_id
      ? supabase.from("bookings").select("id, status, pets(name)").eq("org_id", org.id).eq("group_id", b.group_id).neq("id", b.id)
      : Promise.resolve({ data: [], error: null }),
    supabase.rpc("available_kennels", { p_org: org.id, p_kind: b.kind, p_start: b.start_date, p_end: b.end_date }),
    supabase.from("vaccinations").select("id, vaccine, valid_until, certificate_path").eq("org_id", org.id).eq("pet_id", b.pet_id).order("vaccine"),
    supabase.from("care_items").select("id, kind, label, details, due_time").eq("org_id", org.id).eq("pet_id", b.pet_id).eq("is_active", true).order("due_time"),
    supabase.from("invoice_balances").select("invoice_id, status, number, total_minor, due_minor").eq("org_id", org.id).eq("booking_id", id).neq("status", "void").maybeSingle(),
    supabase
      .from("payments")
      .select("id, direction, amount_minor, method, received_on, reference")
      .eq("org_id", org.id)
      .eq("booking_id", id)
      .is("invoice_id", null)
      .order("received_on"),
    supabase
      .from("stay_updates")
      .select("id, body, media_paths, is_visible_to_parent, created_at")
      .eq("org_id", org.id)
      .eq("booking_id", id)
      .order("created_at", { ascending: false })
      .limit(20),
    siteOrigin(),
  ]);
  if (items.error || extras.error || peaks.error || family.error || vaccinations.error || routines.error || bill.error || advances.error || updates.error) {
    throw new Error("Could not load the booking.");
  }

  const media = await signedUrls(
    supabase,
    [pet?.photo_path, ...updates.data.flatMap((u) => u.media_paths), ...vaccinations.data.map((v) => v.certificate_path)],
    { small: true },
  );
  const fullMedia = await signedUrls(supabase, vaccinations.data.map((v) => v.certificate_path));
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const open = b.status === "requested" || b.status === "confirmed" || b.status === "checked_in";
  const touching = peaksTouching({ kind: b.kind, startDate: b.start_date, endDate: b.end_date }, (peaks.data ?? []).map(toPeak));
  const noRefund = touching.filter((p) => p.noRefund);
  const overstay = isOverstaying({ status: b.status, endDate: b.end_date }, today);
  const stayUrl = `${origin}/s/${b.public_token}`;
  const freeKennels = [...(b.kennels ? [{ id: b.kennels.id, name: b.kennels.name }] : []), ...(kennels.data ?? []).filter((k) => k.id !== b.kennel_id)];

  const quote = quoteStay(
    {
      kind: b.kind,
      petName: pet?.name ?? w.pet,
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
  // The confirmation goes to the parent, so it is in the kennel's language for parents.
  const p = parentI18n(org.parent_language, org.locale);
  const confirmation = parent
    ? whatsappLink(
        bookingConfirmedMessage(
          p.m.whatsapp,
          {
            kennelName: org.name,
            parentName: parent.full_name,
            petName: pet?.name ?? p.m.whatsapp.yourPet,
            startDate: b.start_date,
            endDate: b.end_date,
            nights: units,
            totalMinor: quote.totalMinor,
            currency: org.currency,
            stayUrl,
          },
          p.locale,
        ),
        parent.phone,
      )
    : null;

  return (
    <>
      {pet ? (
        <div className="mb-3">
          <PetAvatar name={pet.name} url={pet.photo_path ? media.get(pet.photo_path) : null} size="lg" />
        </div>
      ) : null}
      <PageTitle title={pet?.name ?? w.title}>
        <Link href="/app/bookings" className={buttonStyles.quiet}>
          {w.allBookings}
        </Link>
      </PageTitle>

      <div className="mb-5 space-y-2">
        <p className="flex flex-wrap items-center gap-2">
          <DoorTag name={b.kennels?.name} empty={m.common.noKennel} />
          <Badge tone={b.status === "checked_in" ? "good" : b.status === "requested" ? "attention" : "neutral"}>{m.labels.bookingStatus[b.status]}</Badge>
          {b.kind === "daycare" ? <Badge>{m.labels.bookingKind.daycare}</Badge> : null}
          {overstay ? <Badge tone="alert">{fill(m.today.wasDueToLeave, { date: formatDate(b.end_date, locale) })}</Badge> : null}
          {touching.map((period) => (
            <Badge key={period.name} tone="attention">
              {period.noRefund ? fill(w.peakNoRefund, { name: period.name }) : period.name}
            </Badge>
          ))}
          {(pet?.flags ?? []).map((f) => (
            <Badge key={f} tone="alert">
              {flagText(m, f)}
            </Badge>
          ))}
        </p>
        <p className="text-lg">{stayText(t, b.kind, b.start_date, b.end_date)}</p>
        {parent ? (
          <p className="text-slate">
            {parent.full_name},{" "}
            <a href={`tel:${parent.phone}`} className="underline underline-offset-4">
              {formatPhone(parent.phone)}
            </a>
          </p>
        ) : null}
        {b.cancel_reason && b.status === "cancelled" ? <p className="text-slate">{fill(w.cancelledBecause, { reason: b.cancel_reason })}</p> : null}
      </div>

      {justBooked ? (
        <Notice tone="ok">
          {b.status === "requested" ? w.savedAsRequest : w.booked}
          {family.data.length > 0 ? ` ${fill(w.bookedTogether, { n: family.data.length + 1 })}` : ""}
        </Notice>
      ) : null}

      {done ? <Notice tone="ok">{done}</Notice> : null}
      {b.status === "requested" || b.status === "confirmed" ? (
        <VaccinationWarnings t={t} warnings={vaccinationWarnings(vaccinations.data, { startDate: b.start_date, endDate: b.end_date })} />
      ) : null}

      {open ? (
        <Section title={w.next}>
          <NextStep
            t={t}
            booking={b}
            today={today}
            overstay={overstay}
            freeKennels={freeKennels}
            vaccinations={vaccinations.data}
            stayEnds={b.end_date}
            updateLink={b.status === "checked_in" ? `/app/bookings/${b.id}/update` : null}
          />
        </Section>
      ) : null}

      {b.status !== "cancelled" && b.status !== "no_show" ? (
        <Section title={w.stayPage}>
          <p className="mb-3 break-all text-slate">{stayUrl}</p>
          <div className="flex flex-wrap gap-2">
            {confirmation && b.status !== "requested" ? (
              <a href={confirmation} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
                {w.sendConfirmation}
              </a>
            ) : null}
            <CopyButton text={stayUrl} words={m.copy} />
            <a href={stayUrl} target="_blank" rel="noreferrer" className={buttonStyles.quiet}>
              {w.openIt}
            </a>
          </div>
        </Section>
      ) : null}

      {family.data.length > 0 ? (
        <Section title={w.bookedTogetherTitle} count={family.data.length}>
          <Ledger>
            {family.data.map((f) => (
              <li key={f.id}>
                <Link href={`/app/bookings/${f.id}`} className="flex min-h-12 items-center gap-3 px-4 py-3 hover:bg-ground">
                  <span className="font-bold">{f.pets?.name ?? w.pet}</span>
                  <Badge>{m.labels.bookingStatus[f.status]}</Badge>
                </Link>
              </li>
            ))}
          </Ledger>
        </Section>
      ) : null}

      <Section title={w.costs.title}>
        <Ledger>
          {quote.lines.map((l, i) => (
            <LedgerRow key={i}>
              <span className="min-w-0 flex-1">
                {fill(l.discountMinor > 0 ? w.costs.lineLess : w.costs.line, {
                  what: i === 0 ? m.labels.bookingKind[b.kind] : l.description,
                  quantity: l.quantity,
                  price: money(l.unitPriceMinor),
                  discount: money(l.discountMinor),
                })}
              </span>
              <span className="font-semibold">{money(l.totalMinor)}</span>
              {i > 0 && canManage && open ? (
                <ActionForm action={removeExtra} className="contents">
                  <input type="hidden" name="itemId" value={items.data[i - 1].id} />
                  <SubmitButton variant="quiet" pendingLabel={m.common.removing}>
                    {m.common.remove}
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </LedgerRow>
          ))}
          <LedgerRow>
            <span className="flex-1 font-bold">{quote.taxMinor > 0 ? fill(w.costs.totalWithTax, { tax: money(quote.taxMinor) }) : w.costs.total}</span>
            <span className="text-lg font-extrabold">{money(quote.totalMinor)}</span>
          </LedgerRow>
        </Ledger>
        <p className="mt-2 text-sm text-slate">{w.costs.note}</p>

        {open ? (
          <ActionForm action={addExtra} className="mt-4 space-y-4 rounded-xl border border-rule bg-paper p-4">
            <input type="hidden" name="bookingId" value={b.id} />
            <p className="font-bold">{w.extra.title}</p>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label={w.extra.fromList}>
                  <Select name="serviceId" defaultValue="">
                    <option value="">{w.extra.somethingElse}</option>
                    {extras.data.map((s) => (
                      <option key={s.id} value={s.id}>
                        {fill(w.extra.option, { name: s.name, price: money(s.price_minor) })}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field label={w.extra.howMany}>
                <Input name="quantity" inputMode="decimal" defaultValue="1" />
              </Field>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <Field label={w.extra.describe} hint={w.extra.describeHint}>
                  <Input name="description" maxLength={200} />
                </Field>
              </div>
              <Field label={w.extra.price}>
                <Input name="price" inputMode="decimal" />
              </Field>
            </div>
            <SubmitButton variant="secondary" pendingLabel={m.common.adding}>
              {w.extra.add}
            </SubmitButton>
            {extras.data.length === 0 && canManage ? (
              <p className="text-sm text-slate">
                <Rich
                  text={w.extra.addToList}
                  parts={{
                    link: (
                      <Link href="/app/more/extras" className="underline underline-offset-4">
                        {w.extra.extrasLink}
                      </Link>
                    ),
                  }}
                />
              </p>
            ) : null}
          </ActionForm>
        ) : null}
      </Section>

      {b.status !== "requested" && b.status !== "cancelled" ? (
        <Section title={w.bill.title}>
          {bill.data ? (
            <Link href={`/app/bills/${bill.data.invoice_id}`} className="flex min-h-12 flex-wrap items-center gap-3 rounded-xl border border-rule bg-paper px-4 py-3 hover:bg-ground">
              <span className="font-bold">{bill.data.number ?? w.bill.draft}</span>
              <span className="flex-1 tabular-nums">{money(bill.data.total_minor ?? 0)}</span>
              {bill.data.status === "issued" ? (
                (bill.data.due_minor ?? 0) > 0 ? (
                  <Badge tone="attention">{fill(w.bill.due, { amount: money(bill.data.due_minor ?? 0) })}</Badge>
                ) : (
                  <Badge tone="good">{w.bill.paid}</Badge>
                )
              ) : (
                <Badge tone="attention">{w.bill.notIssued}</Badge>
              )}
            </Link>
          ) : (
            <ActionForm action={makeBill} className="space-y-2">
              <input type="hidden" name="bookingId" value={b.id} />
              <p>{b.status === "checked_out" ? fill(w.bill.goneHome, { pet: pet?.name ?? w.bill.thePet }) : w.bill.noneYet}</p>
              <SubmitButton variant={b.status === "checked_out" ? "primary" : "secondary"} pendingLabel={w.bill.making}>
                {w.bill.make}
              </SubmitButton>
            </ActionForm>
          )}

          {advances.data.length > 0 ? (
            <ul className="mt-3 space-y-1">
              {advances.data.map((a) => {
                const pay = w.payment;
                const template = a.direction === "out" ? (a.reference ? pay.refundWithReference : pay.refund) : a.reference ? pay.advanceWithReference : pay.advance;
                return (
                  <li key={a.id} className="text-slate">
                    {fill(template, {
                      amount: money(a.amount_minor),
                      date: formatDate(a.received_on, locale),
                      method: m.labels.paymentMethod[a.method],
                      reference: a.reference ?? "",
                    })}
                  </li>
                );
              })}
            </ul>
          ) : null}
          {bill.data?.status !== "issued" ? <PaymentForm words={m.payments} bookingId={b.id} defaultAmount="" today={today} canRefund={false} /> : null}
        </Section>
      ) : null}

      {open ? (
        <Section title={w.change.title}>
          <ActionForm action={updateBooking} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <input type="hidden" name="bookingId" value={b.id} />
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={b.kind === "daycare" ? w.change.firstDay : w.change.checkInDate}>
                <Input name="startDate" type="date" required defaultValue={b.start_date} />
              </Field>
              <Field label={b.kind === "daycare" ? w.change.lastDay : w.change.checkOutDate}>
                <Input name="endDate" type="date" required defaultValue={b.end_date} />
              </Field>
            </div>
            <Field label={w.change.kennel} hint={w.change.kennelHint}>
              <Select name="kennelId" defaultValue={b.kennel_id ?? ""}>
                <option value="">{b.status === "checked_in" ? m.common.noKennel : w.change.decideAtCheckIn}</option>
                {freeKennels.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={w.change.dropOff}>
                <Input name="expectedArrival" type="time" defaultValue={b.expected_arrival?.slice(0, 5) ?? ""} />
              </Field>
              <Field label={w.change.pickUp}>
                <Input name="expectedDeparture" type="time" defaultValue={b.expected_departure?.slice(0, 5) ?? ""} />
              </Field>
            </div>
            {canManage ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label={b.kind === "boarding" ? w.change.pricePerNight : w.change.pricePerDay}>
                  <Input name="rate" inputMode="decimal" required defaultValue={toDecimalString(b.rate_minor).replace(/\.00$/, "")} />
                </Field>
                <Field label={w.change.discount} hint={w.change.discountHint}>
                  <Input name="discount" inputMode="decimal" defaultValue={b.discount_minor ? toDecimalString(b.discount_minor).replace(/\.00$/, "") : ""} />
                </Field>
              </div>
            ) : (
              <p className="text-slate">{fill(b.kind === "boarding" ? w.change.priceNight : w.change.priceDay, { price: money(b.rate_minor) })}</p>
            )}
            <Field label={w.change.belongings} hint={w.change.belongingsHint}>
              <Textarea name="belongings" maxLength={2000} defaultValue={b.belongings ?? ""} />
            </Field>
            <Field label={w.change.notes}>
              <Textarea name="notes" maxLength={2000} defaultValue={b.notes ?? ""} />
            </Field>
            <SubmitButton pendingLabel={m.common.saving}>{m.common.saveChanges}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {pet ? (
        <Section title={fill(w.routines.title, { pet: pet.name })} count={routines.data.length}>
          {routines.data.length === 0 ? (
            <Empty>{w.routines.none}</Empty>
          ) : (
            <Ledger>
              {routines.data.map((r) => (
                <LedgerRow key={r.id}>
                  <span className="min-w-0 flex-1">
                    <span className="font-bold">{clockText(m, r.due_time)}</span> {r.label}
                    {r.kind === "medication" ? (
                      <>
                        {" "}
                        <Badge tone="alert">{m.labels.careKind.medication}</Badge>
                      </>
                    ) : null}
                    {r.details ? <span className="block text-slate">{r.details}</span> : null}
                  </span>
                  <ActionForm action={stopRoutine} className="contents">
                    <input type="hidden" name="routineId" value={r.id} />
                    <SubmitButton variant="quiet" pendingLabel={w.routines.stopping}>
                      {w.routines.stop}
                    </SubmitButton>
                  </ActionForm>
                </LedgerRow>
              ))}
            </Ledger>
          )}
          <RoutineForm petId={pet.id} />
        </Section>
      ) : null}

      {b.status !== "cancelled" && b.status !== "no_show" ? (
        <Section title={w.updates.title} count={updates.data.length}>
          {updates.data.length === 0 ? (
            <Empty>{w.updates.none}</Empty>
          ) : (
            <ul className="space-y-3">
              {updates.data.map((u) => (
                <li key={u.id} className="rounded-xl border border-rule bg-paper p-4">
                  <p className="mb-1 flex flex-wrap items-center gap-2 text-sm text-slate">
                    {new Intl.DateTimeFormat(locale, { timeZone: org.time_zone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(new Date(u.created_at))}
                    {u.is_visible_to_parent ? <Badge tone="good">{w.updates.parentSees}</Badge> : <Badge>{w.updates.teamOnly}</Badge>}
                  </p>
                  <p className="whitespace-pre-line">{u.body}</p>
                  {u.media_paths.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {u.media_paths.map((path) =>
                        media.get(path) ? (
                          // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file
                          <img key={path} src={media.get(path)} alt="" loading="lazy" className="size-20 rounded-lg object-cover" />
                        ) : null,
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          <Link href={`/app/bookings/${b.id}/update`} className={`${buttonStyles.secondary} mt-3`}>
            {w.updates.write}
          </Link>
        </Section>
      ) : null}

      {pet ? (
        <Section title={fill(w.about.title, { pet: pet.name })}>
          <div className="mb-4 rounded-xl border border-rule bg-paper p-4">
            <p className="mb-2 font-bold">{w.about.vaccinations}</p>
            <VaccinationList t={t} records={vaccinations.data} today={today} certificates={fullMedia} />
          </div>
          <Link href={`/app/dogs/${pet.id}`} className={`${buttonStyles.secondary} mb-4`}>
            {fill(w.about.petPage, { pet: pet.name })}
          </Link>

          {pet.food_notes || pet.medical_notes || pet.allergies || pet.behaviour_notes ? (
          <dl className="space-y-3 rounded-xl border border-rule bg-paper p-4">
            <About label={w.about.food}>{pet.food_notes}</About>
            <About label={w.about.health} alert>
              {pet.medical_notes}
            </About>
            <About label={w.about.allergies} alert>
              {pet.allergies}
            </About>
            <About label={w.about.behaviour}>{pet.behaviour_notes}</About>
          </dl>
          ) : null}
        </Section>
      ) : null}

      {b.status === "requested" || b.status === "confirmed" ? (
        <Section title={w.cancel.title}>
          {noRefund.length > 0 ? (
            <Notice tone="info">
              {fill(w.cancel.noRefund, { periods: noRefund.map((period) => period.name).reduce((list, name) => fill(w.cancel.and, { a: list, b: name })) })}
            </Notice>
          ) : null}
          <ActionForm action={cancelBooking} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <input type="hidden" name="bookingId" value={b.id} />
            <Field label={w.cancel.why}>
              <Input name="reason" required maxLength={500} />
            </Field>
            <SubmitButton variant="secondary" pendingLabel={w.cancel.cancelling}>
              {w.cancel.button}
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
  t,
  booking: b,
  today,
  overstay,
  freeKennels,
  vaccinations,
  stayEnds,
  updateLink,
}: {
  t: I18n;
  booking: NextBooking;
  today: string;
  overstay: boolean;
  freeKennels: { id: string; name: string }[];
  vaccinations: { id: string; vaccine: string; valid_until: string | null }[];
  stayEnds: string;
  updateLink: string | null;
}) {
  const { m, locale } = t;
  const w = m.booking.step;
  if (b.status === "requested") {
    return (
      <ActionForm action={confirmRequest} className="space-y-3">
        <input type="hidden" name="bookingId" value={b.id} />
        <p>{w.isRequest}</p>
        <SubmitButton pendingLabel={w.confirming}>{w.confirm}</SubmitButton>
      </ActionForm>
    );
  }

  if (b.status === "checked_in") {
    return (
      <div className="flex flex-wrap gap-2">
        {overstay ? (
          <ActionForm action={extendToToday} className="w-full">
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="from" value="booking" />
            <p className="mb-2">{fill(w.stillHere, { date: formatDate(stayEnds, locale) })}</p>
            <SubmitButton pendingLabel={w.extending}>{w.extend}</SubmitButton>
          </ActionForm>
        ) : null}
        {updateLink ? (
          <Link href={updateLink} className={buttonStyles.whatsapp}>
            {w.writeUpdate}
          </Link>
        ) : null}
        <ActionForm action={checkOut} className="contents">
          <input type="hidden" name="bookingId" value={b.id} />
          <input type="hidden" name="from" value="booking" />
          <SubmitButton pendingLabel={w.checkingOut} variant={stayEnds <= today ? "primary" : "secondary"}>
            {w.checkOut}
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
        <input type="hidden" name="from" value="booking" />
        <p className="font-bold">{w.checklist}</p>
        <Field label={w.kennel}>
          <Select name="kennelId" defaultValue={b.kennel_id ?? ""}>
            <option value="">{w.noKennelYet}</option>
            {freeKennels.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Select>
        </Field>
        <div>
          <p className="mb-1 font-semibold">{w.vaccinations}</p>
          {vaccinations.length === 0 ? (
            <p className="text-slate">{w.noVaccinations}</p>
          ) : (
            <ul className="mb-2 space-y-1">
              {vaccinations.map((v) => {
                const lapsed = v.valid_until !== null && v.valid_until < stayEnds;
                return (
                  <li key={v.id} className="flex flex-wrap items-center gap-2">
                    <span>{v.vaccine.replaceAll("_", " ")}</span>
                    {v.valid_until ? (
                      <Badge tone={lapsed ? "alert" : "good"}>
                        {fill(v.valid_until < today ? w.expiredUntil : lapsed ? w.runsOutUntil : w.validUntil, { date: formatDate(v.valid_until, locale) })}
                      </Badge>
                    ) : (
                      <Badge tone="attention">{m.labels.vaccinationStatus.no_date}</Badge>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" name="vaccinationsChecked" defaultChecked={b.vaccinations_checked_at !== null} className="size-5" />
            <span>{w.seenCertificates}</span>
          </label>
        </div>
        <Field label={w.belongings} hint={w.belongingsHint}>
          <Textarea name="belongings" maxLength={2000} defaultValue={b.belongings ?? ""} />
        </Field>
        <Field label={w.gate} hint={w.gateHint}>
          <Textarea name="gateNotes" maxLength={2000} defaultValue={b.gate_notes ?? ""} />
        </Field>
        <SubmitButton pendingLabel={w.checkingIn}>{w.checkIn}</SubmitButton>
      </ActionForm>
      <ActionForm action={markNoShow} className="contents">
        <input type="hidden" name="bookingId" value={b.id} />
        <SubmitButton variant="quiet" pendingLabel={m.common.saving}>
          {w.didNotArrive}
        </SubmitButton>
      </ActionForm>
    </div>
  );
}
