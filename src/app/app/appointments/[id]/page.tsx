import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { HealthAtTheDoor } from "@/components/stay-health";
import { workingPeople } from "@/lib/appointments";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatMoney, formatPhone, localClock, localDate, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import {
  addAppointmentItem, makeAppointmentBill, moveAppointment, orderPartyCake, saveAppointmentNotes, saveParty, setAppointmentPerson, setAppointmentPrice,
} from "../actions";

export const generateMetadata = () => appTitle((m) => m.appointment.title);

export default function AppointmentPage({ params, searchParams }: PageProps<"/app/appointments/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Appointment params={params} searchParams={searchParams} />
    </Suspense>
  );
}

const APPOINTMENT =
  "id, kind, status, starts_at, ends_at, held_until, place_id, staff_id, booking_id, course_id, in_package, price_minor, vaccinations_checked_at, life_jacket, guest_pet_id, guest_vaccinations_checked_at, people, notes, after_notes, homework, cancel_reason, client_id, pet_id, service_id, pets!appointments_org_id_client_id_pet_id_fkey(name), clients(full_name, phone), appointment_services(name, checks_vaccinations, max_people), appointment_places(name), bookings(id, status, vaccinations_checked_at), courses(name, invoice_id)" as const;

async function Appointment({ params, searchParams }: Pick<PageProps<"/app/appointments/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const query = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const w = m.appointment;
  const doneKey = typeof query.done === "string" && query.done in w.done_ ? (query.done as keyof typeof w.done_) : null;
  const supabase = await createClient();
  const res = await supabase.from("appointments").select(APPOINTMENT).eq("org_id", org.id).eq("id", id).maybeSingle();
  if (res.error) throw new Error("Could not load the appointment.");
  if (!res.data) notFound();
  const a = res.data;
  const [items, addOns, people, bill, guests, cakes, cakeOrders] = await Promise.all([
    supabase.from("appointment_items").select("id, description, quantity, unit_price_minor").eq("org_id", org.id).eq("appointment_id", a.id).order("created_at"),
    supabase.from("appointment_services").select("id, name, price_minor, pricing").eq("org_id", org.id).eq("is_addon", true).eq("is_active", true).order("name"),
    workingPeople(supabase, org.id),
    supabase.from("invoice_balances").select("invoice_id, status, number, total_minor, due_minor").eq("org_id", org.id).eq("appointment_id", a.id).neq("status", "void").maybeSingle(),
    a.kind === "party" ? supabase.from("pets").select("id, name, clients(full_name)").eq("org_id", org.id).is("deleted_at", null).neq("id", a.pet_id).order("name").limit(500) : Promise.resolve({ data: [], error: null }),
    a.kind === "party" && org.offers_kitchen
      ? supabase.from("food_products").select("id, name, price_minor").eq("org_id", org.id).eq("kind", "item").eq("is_active", true).order("name")
      : Promise.resolve({ data: [], error: null }),
    a.kind === "party" ? supabase.from("deliveries").select("id, inscription, status, food_products(name)").eq("org_id", org.id).eq("appointment_id", a.id) : Promise.resolve({ data: [], error: null }),
  ]);
  if (items.error || addOns.error || people.error || bill.error || guests.error || cakes.error || cakeOrders.error) throw new Error("Could not load the appointment.");

  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const clock = (iso: string) => localClock(iso, org.time_zone);
  const day = localDate(a.starts_at, org.time_zone);
  const pet = a.pets?.name ?? m.booking.pet;
  const person = people.data.find((x) => x.user_id === a.staff_id)?.display_name ?? null;
  const open = a.status === "requested" || a.status === "confirmed";
  const seen = Boolean(a.vaccinations_checked_at || a.bookings?.vaccinations_checked_at);
  const service = a.appointment_services;
  const free = Boolean(a.course_id) || a.in_package;
  // The session's notes go to the parent, so they are in the kennel's language for parents.
  const p = parentI18n(org.parent_language, org.locale);
  const notesMessage =
    a.after_notes && a.clients
      ? whatsappLink(
          [
            fill(p.m.whatsappAppointments.trainingNotes, { parent: a.clients.full_name.split(" ")[0], pet, service: service?.name ?? "", kennel: org.name, notes: a.after_notes }),
            a.homework ? fill(p.m.whatsappAppointments.homework, { homework: a.homework }) : null,
          ]
            .filter(Boolean)
            .join("\n"),
          a.clients.phone,
        )
      : null;
  const peopleSelect = (name: string, value: string | null) => (
    <Select name={name} defaultValue={value ?? ""}>
      <option value="">{w.nobody}</option>
      {people.data.map((x) => (
        <option key={x.user_id} value={x.user_id}>
          {x.display_name}
        </option>
      ))}
    </Select>
  );

  return (
    <>
      <PageTitle title={pet}>
        <Link href={`/app/appointments?date=${day}`} className={buttonStyles.quiet}>
          {w.all}
        </Link>
      </PageTitle>

      <div className="mb-5 space-y-2">
        <p className="flex flex-wrap items-center gap-2">
          <Badge tone={a.status === "requested" ? "attention" : a.status === "done" ? "good" : a.status === "cancelled" || a.status === "no_show" ? "alert" : "neutral"}>
            {m.appointmentStatus[a.status]}
          </Badge>
          <Badge>{m.appointmentKinds[a.kind]}</Badge>
          <span className="text-lg font-bold">{service?.name}</span>
        </p>
        <p className="text-lg">{fill(w.when, { date: formatDate(day, locale), from: clock(a.starts_at), to: clock(a.ends_at) })}</p>
        {a.held_until > a.ends_at ? <p className="text-slate">{fill(w.cleanupUntil, { time: clock(a.held_until) })}</p> : null}
        <p>
          {a.appointment_places?.name}, {person ? fill(m.appointments.with, { person }) : w.nobody}
        </p>
        <p className="font-semibold">
          {a.course_id && a.courses ? fill(w.fromCourse, { name: a.courses.name }) : a.in_package ? w.inPackage : a.price_minor === null ? w.noPrice : `${w.price}: ${money(a.price_minor)}`}
        </p>
        {a.booking_id ? (
          <p>
            {fill(w.stay, { pet })}.{" "}
            <Link href={`/app/bookings/${a.booking_id}`} className="font-semibold underline underline-offset-4">
              {w.openStay}
            </Link>
          </p>
        ) : (
          <p className="text-slate">{m.appointments.visitor}</p>
        )}
        {a.clients ? (
          <p className="text-slate">
            {a.clients.full_name},{" "}
            <a href={`tel:${a.clients.phone}`} className="underline underline-offset-4">
              {formatPhone(a.clients.phone)}
            </a>
          </p>
        ) : null}
        {a.status === "cancelled" && a.cancel_reason ? <p className="text-slate">{fill(w.cancelled, { reason: a.cancel_reason })}</p> : null}
      </div>

      {doneKey ? <Notice tone="ok">{w.done_[doneKey]}</Notice> : null}
      {open && !a.booking_id && a.appointment_services?.checks_vaccinations ? <HealthAtTheDoor t={t} petId={a.pet_id} on={day} appointmentId={a.id} /> : null}

      {open ? (
        <Section title={w.next}>
          <div className="space-y-4">
            {a.status === "requested" ? (
              <ActionForm action={moveAppointment}>
                <input type="hidden" name="appointmentId" value={a.id} />
                <input type="hidden" name="intent" value="confirmed" />
                <SubmitButton pendingLabel={m.common.saving}>{w.confirm}</SubmitButton>
              </ActionForm>
            ) : (
              <ActionForm action={moveAppointment} className="space-y-3 rounded-xl border border-rule bg-paper p-4">
                <input type="hidden" name="appointmentId" value={a.id} />
                <input type="hidden" name="intent" value="done" />
                {service?.checks_vaccinations ? (
                  seen ? (
                    <p className="font-semibold text-leaf">{a.vaccinations_checked_at ? w.vaccinationsChecked : w.vaccinationsAtCheckIn}</p>
                  ) : (
                    <label className="flex min-h-12 items-center gap-2 font-semibold">
                      <input type="checkbox" name="vaccinations" className="size-5" />
                      {w.vaccinationsSeen}
                    </label>
                  )
                ) : null}
                {a.kind === "swim" ? (
                  <>
                    <fieldset>
                      <legend className="mb-1 font-semibold">{w.lifeJacket}</legend>
                      <div className="flex flex-wrap gap-2">
                        {(["yes", "no"] as const).map((v) => (
                          <label key={v} className="flex min-h-12 items-center gap-2 rounded-lg border-2 border-rule px-3 has-[:checked]:border-ink">
                            <input type="radio" name="lifeJacket" value={v} defaultChecked={a.life_jacket === null ? v === "yes" : a.life_jacket === (v === "yes")} className="size-5" />
                            {v === "yes" ? w.lifeJacketYes : w.lifeJacketNo}
                          </label>
                        ))}
                      </div>
                    </fieldset>
                    <Field label={w.supervisor}>{peopleSelect("supervisorId", a.staff_id)}</Field>
                  </>
                ) : null}
                <div className="flex flex-wrap gap-2">
                  <SubmitButton pendingLabel={m.common.saving}>{w.done}</SubmitButton>
                </div>
              </ActionForm>
            )}
            {a.status === "confirmed" ? (
              <ActionForm action={moveAppointment}>
                <input type="hidden" name="appointmentId" value={a.id} />
                <input type="hidden" name="intent" value="no_show" />
                <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                  {w.noShow}
                </SubmitButton>
              </ActionForm>
            ) : null}
            <details>
              <summary className={`${buttonStyles.quiet} cursor-pointer`}>{w.cancel}</summary>
              <ActionForm action={moveAppointment} className="mt-2 space-y-3 rounded-xl border border-rule bg-paper p-4">
                <input type="hidden" name="appointmentId" value={a.id} />
                <input type="hidden" name="intent" value="cancelled" />
                <Field label={w.cancelReason}>
                  <Input name="reason" required maxLength={300} />
                </Field>
                <SubmitButton variant="danger" pendingLabel={m.common.saving}>
                  {w.cancelButton}
                </SubmitButton>
              </ActionForm>
            </details>
          </div>
        </Section>
      ) : null}

      {open ? (
        <Section title={w.person}>
          <ActionForm action={setAppointmentPerson} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="appointmentId" value={a.id} />
            <div className="min-w-48 flex-1">
              <Field label={w.changePerson}>{peopleSelect("staffId", a.staff_id)}</Field>
            </div>
            <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
              {w.savePerson}
            </SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {canManage && !free && a.status !== "cancelled" && !bill.data?.number ? (
        <Section title={w.setPrice}>
          <ActionForm action={setAppointmentPrice} className="flex flex-wrap items-end gap-2">
            <input type="hidden" name="appointmentId" value={a.id} />
            <div className="w-40">
              <Field label={w.price}>
                <Input name="price" inputMode="decimal" defaultValue={a.price_minor === null ? "" : String(a.price_minor / 100)} required />
              </Field>
            </div>
            <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
              {w.setPriceButton}
            </SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {a.kind === "party" ? (
        <Section title={w.party}>
          <ActionForm action={saveParty} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <input type="hidden" name="appointmentId" value={a.id} />
            <Field label={w.guest}>
              <Select name="guestId" defaultValue={a.guest_pet_id ?? ""}>
                <option value="">{w.noGuest}</option>
                {guests.data.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.name} ({g.clients?.full_name})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={w.people} hint={service?.max_people ? `${service.max_people}` : undefined}>
              <Input name="people" inputMode="numeric" defaultValue={a.people ?? ""} />
            </Field>
            {a.guest_vaccinations_checked_at ? (
              <p className="font-semibold text-leaf sm:col-span-2">{w.guestChecked}</p>
            ) : (
              <label className="flex min-h-12 items-center gap-2 font-semibold sm:col-span-2">
                <input type="checkbox" name="guestSeen" className="size-5" />
                {w.guestSeen}
              </label>
            )}
            <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
              {w.saveParty}
            </SubmitButton>
          </ActionForm>
          {org.offers_kitchen ? (
            <div className="mt-4 space-y-3">
              <p className="font-bold">{w.cake}</p>
              {cakeOrders.data.map((c) => (
                <p key={c.id}>
                  {c.food_products?.name}
                  {c.inscription ? `: "${c.inscription}"` : ""} <Badge>{m.deliveryStatus[c.status]}</Badge>
                </p>
              ))}
              {cakes.data.length === 0 ? (
                <p className="text-slate">{w.cakeNone}</p>
              ) : (
                <ActionForm action={orderPartyCake} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
                  <input type="hidden" name="appointmentId" value={a.id} />
                  <Field label={w.cakeItem}>
                    <Select name="productId" defaultValue={cakes.data[0].id}>
                      {cakes.data.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({money(c.price_minor)})
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field label={w.cakeWords}>
                    <Input name="inscription" maxLength={60} placeholder={w.cakeExample} />
                  </Field>
                  <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                    {w.cakeButton}
                  </SubmitButton>
                </ActionForm>
              )}
            </div>
          ) : null}
        </Section>
      ) : null}

      <Section title={w.notes}>
        <ActionForm action={saveAppointmentNotes} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <input type="hidden" name="appointmentId" value={a.id} />
          <Field label={w.notes}>
            <Textarea name="notes" maxLength={500} defaultValue={a.notes ?? ""} />
          </Field>
          <Field label={w.afterNotes}>
            <Textarea name="after_notes" maxLength={2000} defaultValue={a.after_notes ?? ""} />
          </Field>
          {a.kind === "training" ? (
            <Field label={w.homework}>
              <Textarea name="homework" maxLength={2000} defaultValue={a.homework ?? ""} />
            </Field>
          ) : (
            <input type="hidden" name="homework" value={a.homework ?? ""} />
          )}
          <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
            {w.saveNotes}
          </SubmitButton>
        </ActionForm>
        {notesMessage ? (
          <a href={notesMessage} target="_blank" rel="noreferrer" className={`${buttonStyles.whatsapp} mt-3`}>
            {w.sendNotes}
          </a>
        ) : null}
        {a.kind === "groom" && a.booking_id && a.bookings?.status === "checked_in" ? (
          <Link
            href={`/app/bookings/${a.booking_id}/update?text=${encodeURIComponent(fill(w.photosText, { service: service?.name ?? "" }))}`}
            className={`${buttonStyles.secondary} mt-3 ml-2`}
          >
            {w.photos}
          </Link>
        ) : null}
      </Section>

      <Section title={w.addOns} count={items.data.length}>
        {items.data.length === 0 ? (
          <Empty>{w.addOnsEmpty}</Empty>
        ) : (
          <Ledger>
            {items.data.map((i) => (
              <LedgerRow key={i.id}>
                <span className="flex-1">
                  {i.description}
                  {i.quantity > 1 ? ` x ${i.quantity}` : ""}
                </span>
                <span className="font-semibold">{money(i.unit_price_minor * i.quantity)}</span>
              </LedgerRow>
            ))}
          </Ledger>
        )}
        {a.status !== "cancelled" && addOns.data.length > 0 && !bill.data?.number ? (
          <ActionForm action={addAppointmentItem} className="mt-3 flex flex-wrap items-end gap-2">
            <input type="hidden" name="appointmentId" value={a.id} />
            <div className="min-w-48 flex-1">
              <Field label={w.addOn}>
                <Select name="serviceId" defaultValue={addOns.data[0].id}>
                  {addOns.data.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name} ({s.pricing === "quote" ? m.pricings.quote : money(s.price_minor)})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <SubmitButton variant="secondary" pendingLabel={m.common.adding}>
              {w.addOnButton}
            </SubmitButton>
          </ActionForm>
        ) : null}
      </Section>

      <Section title={w.bill}>
        {a.booking_id ? (
          <p>
            {w.onStayBill}{" "}
            <Link href={`/app/bookings/${a.booking_id}`} className="font-semibold underline underline-offset-4">
              {w.openStay}
            </Link>
          </p>
        ) : a.course_id ? (
          <p>
            {w.onCourseBill}{" "}
            {a.courses?.invoice_id ? (
              <Link href={`/app/bills/${a.courses.invoice_id}`} className="font-semibold underline underline-offset-4">
                {m.courses.bill}
              </Link>
            ) : null}
          </p>
        ) : bill.data ? (
          <Link href={`/app/bills/${bill.data.invoice_id}`} className="flex min-h-12 flex-wrap items-center gap-3 rounded-xl border border-rule bg-paper px-4 py-3 hover:bg-ground">
            <span className="font-bold">{bill.data.number ?? m.booking.bill.draft}</span>
            <span className="flex-1 tabular-nums">{money(bill.data.total_minor ?? 0)}</span>
            {bill.data.status === "issued" && (bill.data.due_minor ?? 0) > 0 ? <Badge tone="attention">{fill(m.booking.bill.due, { amount: money(bill.data.due_minor ?? 0) })}</Badge> : null}
          </Link>
        ) : a.status === "confirmed" || a.status === "done" || a.status === "no_show" ? (
          <ActionForm action={makeAppointmentBill}>
            <input type="hidden" name="appointmentId" value={a.id} />
            <SubmitButton pendingLabel={m.common.saving}>{w.makeBill}</SubmitButton>
          </ActionForm>
        ) : null}
      </Section>
    </>
  );
}
