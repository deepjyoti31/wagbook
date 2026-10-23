"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { appointmentsOn } from "@/lib/appointments";
import { billFor, billFromLines, draftPayload } from "@/lib/billing";
import { formatDate, freeTimes, isISODate, localClock, localDate, parseMoney, PET_COATS, todayIn, zonedInstant } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { stayBillLines, UNPRICED } from "@/lib/stay-bill";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
type Supabase = Awaited<ReturnType<typeof createClient>>;

/** The pet's stay that a day falls on, if it is staying: requested, confirmed or in house. */
async function stayOn(supabase: Supabase, orgId: string, petId: string, day: string) {
  const { data } = await supabase
    .from("bookings")
    .select("id")
    .eq("org_id", orgId)
    .eq("pet_id", petId)
    .in("status", ["requested", "confirmed", "checked_in"])
    .lte("start_date", day)
    .gte("end_date", day)
    .order("start_date")
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

/**
 * Book an appointment at one of the free times offered (M34). A pet staying
 * that day is booked on its stay; otherwise it is a visit. The database
 * prices it and refuses a place, pet or person taken at that time.
 */
export async function bookAppointment(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.newAppointment.errors;
  const pet = Id.safeParse(form.get("petId"));
  if (!pet.success) return { error: e.pet };
  const service = Id.safeParse(form.get("serviceId"));
  if (!service.success) return { error: e.service };
  const day = text(form, "date");
  if (!day || !isISODate(day)) return { error: e.date };
  const time = Clock.safeParse(text(form, "time"));
  if (!time.success) return { error: e.time };
  const minutes = Number(text(form, "minutes"));
  if (!Number.isInteger(minutes) || minutes < 5 || minutes > 720) return { error: e.minutes };
  const place = Id.safeParse(form.get("placeId"));
  const staffText = text(form, "staffId");
  const staff = staffText ? Id.safeParse(staffText) : null;
  if (staff && !staff.success) return { error: e.person };
  const course = Id.safeParse(form.get("courseId"));
  const notes = text(form, "notes");
  if ((notes?.length ?? 0) > 500) return { error: e.tooLong };
  const priceText = canManage ? text(form, "price") : null;
  const price = priceText === null ? null : parseMoney(priceText);
  if (priceText !== null && (price === null || price < 0)) return { error: e.price };

  const supabase = await createClient();
  const owner = await supabase.from("pets").select("client_id").eq("org_id", org.id).eq("id", pet.data).maybeSingle();
  if (!owner.data) return { error: e.pet };
  const booking = await stayOn(supabase, org.id, pet.data, day);
  const starts = zonedInstant(day, time.data, org.time_zone);
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      org_id: org.id,
      client_id: owner.data.client_id,
      pet_id: pet.data,
      service_id: service.data,
      place_id: place.success ? place.data : null,
      staff_id: staff ? staff.data : null,
      booking_id: booking,
      course_id: course.success ? course.data : null,
      in_package: Boolean(booking) && checked(form, "inPackage"),
      status: checked(form, "request") ? "requested" : "confirmed",
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + minutes * 60_000).toISOString(),
      price_minor: price,
      notes,
    })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/appointments/${data.id}?done=booked`);
}

const STATUS_INTENTS = ["confirmed", "done", "no_show", "cancelled"] as const;

/** Confirm, mark done (with the certificates, and a swim's life jacket and supervisor), did not come, or cancel with a reason. */
export async function setAppointmentStatus(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.appointment.errors;
  const id = Id.safeParse(form.get("appointmentId"));
  if (!id.success) return { error: e.notFound };
  const to = z.enum(STATUS_INTENTS).safeParse(form.get("intent"));
  if (!to.success) return { error: e.notFound };
  const change: { status: (typeof STATUS_INTENTS)[number]; cancel_reason?: string; vaccinations_checked_at?: string; life_jacket?: boolean; staff_id?: string } = { status: to.data };
  if (to.data === "cancelled") {
    const reason = text(form, "reason");
    if (!reason || reason.length > 300) return { error: e.reason };
    change.cancel_reason = reason;
  }
  if (to.data === "done") {
    if (checked(form, "vaccinations")) change.vaccinations_checked_at = new Date().toISOString();
    const jacket = form.get("lifeJacket");
    if (jacket === "yes" || jacket === "no") change.life_jacket = jacket === "yes";
    const supervisor = Id.safeParse(form.get("supervisorId"));
    if (supervisor.success) change.staff_id = supervisor.data;
  }
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointments").update(change).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  revalidatePath("/app", "layout");
  redirect(`/app/appointments/${id.data}?done=${to.data}`);
}

/**
 * Move an appointment (M58): a new day and time from the free times, and the
 * place and person if they change. It keeps its length, add-ons and bill. The
 * database checks the new time as it checks a new one (WB270, WB271 and the
 * rest), and History of changes keeps the old time.
 */
export async function moveAppointment(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.newAppointment.errors;
  const id = Id.safeParse(form.get("appointmentId"));
  if (!id.success) return { error: t.m.appointment.errors.notFound };
  const day = text(form, "date");
  if (!day || !isISODate(day)) return { error: e.date };
  const time = Clock.safeParse(text(form, "time"));
  if (!time.success) return { error: e.time };
  const place = Id.safeParse(form.get("placeId"));
  if (!place.success) return { error: t.m.moveAppointment.errors.place };
  const staffText = text(form, "staffId");
  const staff = staffText ? Id.safeParse(staffText) : null;
  if (staff && !staff.success) return { error: e.person };
  const supabase = await createClient();
  const appt = await supabase.from("appointments").select("starts_at, ends_at").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (!appt.data) return { error: t.m.appointment.errors.notFound };
  const length = new Date(appt.data.ends_at).getTime() - new Date(appt.data.starts_at).getTime();
  const starts = zonedInstant(day, time.data, org.time_zone);
  const { error } = await supabase
    .from("appointments")
    .update({
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + length).toISOString(),
      place_id: place.data,
      staff_id: staff ? staff.data : null,
    })
    .eq("org_id", org.id)
    .eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/appointments/${id.data}?done=moved`);
}

/** Who does it. */
export async function setAppointmentPerson(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("appointmentId"));
  if (!id.success) return { error: t.m.appointment.errors.notFound };
  const staffText = text(form, "staffId");
  const staff = staffText ? Id.safeParse(staffText) : null;
  if (staff && !staff.success) return { error: t.m.newAppointment.errors.person };
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update({ staff_id: staff ? staff.data : null }).eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.appointment.done_.saved };
}

/** The notes for whoever does it, and after a session its notes and homework. */
export async function saveAppointmentNotes(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.appointment.errors;
  const id = Id.safeParse(form.get("appointmentId"));
  if (!id.success) return { error: e.notFound };
  const notes = text(form, "notes");
  const after = text(form, "after_notes");
  const homework = text(form, "homework");
  if ((notes?.length ?? 0) > 500 || (after?.length ?? 0) > 2000 || (homework?.length ?? 0) > 2000) return { error: e.tooLong };
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update({ notes, after_notes: after, homework }).eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.appointment.done_.saved };
}

/** A party's one guest dog, the people coming, and that the guest's certificates were seen (M36). */
export async function saveParty(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.appointment.errors;
  const id = Id.safeParse(form.get("appointmentId"));
  if (!id.success) return { error: e.notFound };
  const guest = Id.safeParse(form.get("guestId"));
  const peopleText = text(form, "people");
  const people = peopleText === null ? null : Number(peopleText);
  if (people !== null && (!Number.isInteger(people) || people < 1 || people > 100)) return { error: e.people };
  const change: { guest_pet_id: string | null; people: number | null; guest_vaccinations_checked_at?: string | null } = { guest_pet_id: guest.success ? guest.data : null, people };
  if (!guest.success) change.guest_vaccinations_checked_at = null;
  else if (checked(form, "guestSeen")) change.guest_vaccinations_checked_at = new Date().toISOString();
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update(change).eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.appointment.done_.saved };
}

/** Set or change the price: owners and managers (D15), and how a service on quote is priced. */
export async function setAppointmentPrice(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.appointment.errors;
  if (!canManage) return { error: e.onlyManagers };
  const id = Id.safeParse(form.get("appointmentId"));
  if (!id.success) return { error: e.notFound };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: e.price };
  const supabase = await createClient();
  const { error } = await supabase.from("appointments").update({ price_minor: price }).eq("org_id", org.id).eq("id", id.data);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.appointment.done_.priced };
}

/** An add-on priced on top: its price is the database's, for this pet. */
export async function addAppointmentItem(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.appointment.errors;
  const id = Id.safeParse(form.get("appointmentId"));
  const service = Id.safeParse(form.get("serviceId"));
  if (!id.success) return { error: e.notFound };
  if (!service.success) return { error: e.addOn };
  const supabase = await createClient();
  const appt = await supabase.from("appointments").select("pet_id").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (!appt.data) return { error: e.notFound };
  const price = await supabase.rpc("appointment_price", { p_org: org.id, p_service: service.data, p_pet: appt.data.pet_id });
  if (price.error) return { error: friendlyError(price.error, t) };
  const { error } = await supabase
    .from("appointment_items")
    .insert({ org_id: org.id, appointment_id: id.data, service_id: service.data, description: "", unit_price_minor: price.data ?? 0 });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: t.m.appointment.done_.addOn };
}

/** Make, or bring back in line, the bill of a visitor's appointment (M34). A boarder's is on its stay's bill. */
export async function makeAppointmentBill(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.appointment.errors;
  const id = Id.safeParse(form.get("appointmentId"));
  if (!id.success) return { error: e.notFound };
  const supabase = await createClient();
  const appt = await supabase.from("appointments").select("id, client_id").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (!appt.data) return { error: e.notFound };
  const built = await stayBillLines(supabase, org.id, { appointment: id.data });
  if ("error" in built) return { error: built.error === UNPRICED ? e.unpriced : friendlyError(built.error, t) };
  if (built.lines.length === 0) return { error: t.m.bill.errors.nothingToBill };
  const existing = await supabase.from("invoices").select("id, status").eq("org_id", org.id).eq("appointment_id", id.data).neq("status", "void").maybeSingle();
  if (existing.error) return { error: friendlyError(existing.error, t) };
  if (existing.data?.status === "issued") redirect(`/app/bills/${existing.data.id}`);
  let invoiceId = existing.data?.id;
  if (!invoiceId) {
    const created = await supabase.from("invoices").insert({ org_id: org.id, client_id: appt.data.client_id, appointment_id: id.data }).select("id").single();
    if (created.error) return { error: friendlyError(created.error, t) };
    invoiceId = created.data.id;
  }
  const saved = await supabase.rpc("save_invoice_draft", { p_invoice: invoiceId, ...draftPayload(billFor(org, built.lines)) });
  if (saved.error) return { error: friendlyError(saved.error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/bills/${invoiceId}`);
}

/** A cake from the kitchen for a party (M36): a made-to-order item for the party's day, collected at the kennel, with the words to write on it. */
export async function orderPartyCake(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.appointment.errors;
  const id = Id.safeParse(form.get("appointmentId"));
  const product = Id.safeParse(form.get("productId"));
  if (!id.success || !product.success) return { error: e.notFound };
  const words = text(form, "inscription");
  if (words && words.length > 60) return { error: e.tooLong };
  const supabase = await createClient();
  const appt = await supabase.from("appointments").select("client_id, pet_id, starts_at").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (!appt.data) return { error: e.notFound };
  const day = localDate(appt.data.starts_at, org.time_zone);
  const hour = Number(localClock(appt.data.starts_at, org.time_zone).slice(0, 2));
  const { error } = await supabase.from("deliveries").insert({
    org_id: org.id,
    kind: "item",
    client_id: appt.data.client_id,
    pet_id: appt.data.pet_id,
    product_id: product.data,
    delivery_date: day,
    slot: hour < 13 ? "morning" : hour < 18 ? "afternoon" : "evening",
    appointment_id: id.data,
    inscription: words,
  });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.appointment.cakeOrdered, { date: formatDate(day, t.locale) }) };
}

/**
 * Groom before going home (M35): the stay's last day, at the latest free time
 * that finishes by the pick-up time (the expected departure, or the kennel's
 * check-out time).
 */
export async function groomBeforeHome(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const w = t.m.stayAppointments;
  const id = Id.safeParse(form.get("bookingId"));
  const service = Id.safeParse(form.get("serviceId"));
  if (!id.success || !service.success) return { error: t.m.errors.bookingNotFound };
  const supabase = await createClient();
  const [booking, svc] = await Promise.all([
    supabase.from("bookings").select("id, client_id, pet_id, end_date, expected_departure").eq("org_id", org.id).eq("id", id.data).maybeSingle(),
    supabase.from("appointment_services").select("id, minutes, cleanup_minutes, place_id, appointment_places(opens, closes)").eq("org_id", org.id).eq("id", service.data).maybeSingle(),
  ]);
  if (!booking.data || !svc.data?.appointment_places) return { error: t.m.errors.bookingNotFound };
  const b = booking.data;
  const day = await appointmentsOn(supabase, org.id, org.time_zone, b.end_date);
  if (day.error) return { error: friendlyError(day.error, t) };
  const pickUp = (b.expected_departure ?? org.check_out_time).slice(0, 5);
  const times = freeTimes({
    day: b.end_date,
    opens: svc.data.appointment_places.opens.slice(0, 5),
    closes: svc.data.appointment_places.closes.slice(0, 5),
    minutes: svc.data.minutes,
    cleanup: svc.data.cleanup_minutes,
    timeZone: org.time_zone,
    now: new Date(),
    place: day.data.filter((a) => a.place_id === svc.data!.place_id && a.status !== "requested" && a.status !== "no_show").map((a) => ({ start: a.starts_at, end: a.held_until })),
    pet: day.data.filter((a) => a.pet_id === b.pet_id && a.status !== "requested" && a.status !== "no_show").map((a) => ({ start: a.starts_at, end: a.ends_at })),
    latestEnd: pickUp,
  });
  const last = times.at(-1);
  if (!last) return { error: w.noTime };
  const starts = zonedInstant(b.end_date, last, org.time_zone);
  const { data, error } = await supabase
    .from("appointments")
    .insert({
      org_id: org.id,
      client_id: b.client_id,
      pet_id: b.pet_id,
      service_id: svc.data.id,
      booking_id: b.id,
      starts_at: starts.toISOString(),
      ends_at: new Date(starts.getTime() + svc.data.minutes * 60_000).toISOString(),
    })
    .select("id")
    .single();
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/appointments/${data.id}?done=booked`);
}

/** Put a package on a stay (M37): the database books its parts and says how many found no free time. */
export async function applyPackageToStay(_state: FormState, form: FormData): Promise<FormState> {
  const { canManage } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("bookingId"));
  const pkg = Id.safeParse(form.get("packageId"));
  if (!id.success || !pkg.success) return { error: t.m.errors.bookingNotFound };
  const priceText = canManage ? text(form, "price") : null;
  const price = priceText === null ? null : parseMoney(priceText);
  if (priceText !== null && (price === null || price < 0)) return { error: t.m.appointment.errors.price };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("apply_package", { p_booking: id.data, p_package: pkg.data, p_price: price ?? undefined });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${id.data}?package=${data > 0 ? "left" : "applied"}`);
}

/** A pet's grooming card and coat (M35). Any member. */
export async function saveGroomingCard(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.grooming.errors;
  const pet = Id.safeParse(form.get("petId"));
  if (!pet.success) return { error: t.m.errors.notFound };
  const fields = { usual_cut: text(form, "usual_cut"), products: text(form, "products"), skin: text(form, "skin"), behaviour: text(form, "behaviour") };
  if (Object.values(fields).some((v) => (v?.length ?? 0) > 300)) return { error: e.tooLong };
  const weeksText = text(form, "every_weeks");
  const weeks = weeksText === null ? null : Number(weeksText);
  if (weeks !== null && (!Number.isInteger(weeks) || weeks < 1 || weeks > 52)) return { error: e.weeks };
  const coat = z.enum(PET_COATS).nullable().catch(null).parse(text(form, "coat"));
  const supabase = await createClient();
  const [card, petRow] = await Promise.all([
    supabase.from("pet_grooming").upsert({ org_id: org.id, pet_id: pet.data, ...fields, every_weeks: weeks }, { onConflict: "org_id,pet_id" }),
    supabase.from("pets").update({ coat }).eq("org_id", org.id).eq("id", pet.data),
  ]);
  if (card.error || petRow.error) return { error: friendlyError(card.error ?? petRow.error, t) };
  revalidatePath(`/app/dogs/${pet.data}`);
  return { ok: t.m.grooming.saved };
}

/**
 * Sell a training course (M36): so many sessions of a training service at the
 * price the trainer quoted, with a draft bill for it, as a day boarding pack
 * is sold (D37). Owners and managers. The line is stored in English (D31).
 */
export async function sellCourse(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.courses.errors;
  if (!canManage) return { error: e.onlyManagers };
  const pet = Id.safeParse(form.get("petId"));
  const service = Id.safeParse(form.get("serviceId"));
  if (!pet.success) return { error: t.m.errors.notFound };
  if (!service.success) return { error: e.service };
  const name = text(form, "name");
  if (!name || name.length > 80) return { error: e.name };
  const sessions = Number(text(form, "sessions"));
  if (!Number.isInteger(sessions) || sessions < 1 || sessions > 100) return { error: e.sessions };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: e.price };
  const startsOn = text(form, "starts_on") ?? todayIn(org.time_zone);
  if (!isISODate(startsOn)) return { error: t.m.booking.errors.validDate };
  const supabase = await createClient();
  const [petRow, svc] = await Promise.all([
    supabase.from("pets").select("client_id, name").eq("org_id", org.id).eq("id", pet.data).maybeSingle(),
    supabase.from("appointment_services").select("tax_rate_bp, sac_code").eq("org_id", org.id).eq("id", service.data).maybeSingle(),
  ]);
  if (!petRow.data) return { error: t.m.errors.notFound };
  if (!svc.data) return { error: e.service };
  const totals = billFromLines(org, [
    {
      description: `${name} for ${petRow.data.name}: ${sessions} ${sessions === 1 ? "session" : "sessions"} of training`.slice(0, 300),
      quantity: 1,
      unitPriceMinor: price,
      taxRateBp: org.tax_mode === "none" ? 0 : (svc.data.tax_rate_bp ?? org.default_tax_rate_bp),
      sacCode: svc.data.sac_code,
    },
  ]);
  const bill = await supabase.from("invoices").insert({ org_id: org.id, client_id: petRow.data.client_id }).select("id").single();
  if (bill.error) return { error: friendlyError(bill.error, t) };
  const saved = await supabase.rpc("save_invoice_draft", { p_invoice: bill.data.id, ...draftPayload(totals) });
  if (saved.error) return { error: friendlyError(saved.error, t) };
  const course = await supabase.from("courses").insert({
    org_id: org.id,
    client_id: petRow.data.client_id,
    pet_id: pet.data,
    service_id: service.data,
    name,
    sessions,
    price_minor: price,
    starts_on: startsOn,
    invoice_id: bill.data.id,
  });
  if (course.error) return { error: friendlyError(course.error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/bills/${bill.data.id}`);
}
