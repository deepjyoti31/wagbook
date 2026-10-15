"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { formatDate, isISODate, parseMoney, todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n, type I18n } from "@/lib/i18n-server";
import type { TablesUpdate } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);

/** The dates of a stay, with the reasons in the reader's language. */
function staySchema(m: I18n["m"]) {
  const isoDate = z.string().refine(isISODate, m.booking.errors.validDate);
  return z
    .object({
      kind: z.enum(["boarding", "daycare"]),
      startDate: isoDate,
      endDate: isoDate,
    })
    .refine((b) => b.endDate >= b.startDate, m.errors.constraints.bookings_dates_in_order)
    .refine((b) => b.kind !== "boarding" || b.endDate > b.startDate, m.errors.constraints.bookings_boarding_has_a_night);
}

function newBookingSchema(m: I18n["m"]) {
  const e = m.booking.errors;
  return z.object({
    petIds: z.array(z.uuid(e.choosePet)).min(1, e.choosePet).max(6, e.atMostSix),
    kennelId: z.uuid().nullable(),
    notes: z.string().max(2000).nullable(),
    status: z.enum(["confirmed", "requested"]),
  });
}

/** A typed price, or null when the box was left empty. Undefined means it could not be read. */
function typedMoney(form: FormData, name: string): number | null | undefined {
  const typed = text(form, name);
  if (typed === null) return null;
  const minor = parseMoney(typed);
  return minor === null || minor < 0 ? undefined : minor;
}

/**
 * Book one pet, or several pets of one parent together. Several pets share a
 * group_id and are inserted in one statement, so either all are booked or
 * none is. Staff book at the usual price; only owners and managers can type a
 * different one (the database refuses anything else, see bookings_guard_price).
 */
export async function createBooking(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.booking.errors;
  const kind = form.get("kind") === "daycare" ? "daycare" : "boarding";
  const start = text(form, "startDate");
  const stay = staySchema(t.m).safeParse({ kind, startDate: start, endDate: text(form, "endDate") ?? (kind === "daycare" ? start : null) });
  if (!stay.success) return { error: stay.error.issues[0].message };

  const first = text(form, "petId");
  const also = form.getAll("alsoPetId").filter((v): v is string => typeof v === "string" && v !== "" && v !== first);
  const parsed = newBookingSchema(t.m).safeParse({
    petIds: first ? [first, ...new Set(also)] : [],
    kennelId: text(form, "kennelId"),
    notes: text(form, "notes"),
    status: form.get("intent") === "requested" ? "requested" : "confirmed",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const b = { ...parsed.data, ...stay.data };

  const supabase = await createClient();

  // The pets decide the parent. Reading them through our own session also proves they belong to this organisation.
  const pets = await supabase.from("pets").select("id, client_id").eq("org_id", org.id).in("id", b.petIds).is("deleted_at", null);
  if (pets.error) return { error: friendlyError(pets.error, t) };
  if (pets.data.length !== b.petIds.length) return { error: t.m.errors.petNotFound };
  const clientId = pets.data[0].client_id;
  if (pets.data.some((p) => p.client_id !== clientId)) return { error: e.sameParent };

  const service = await supabase
    .from("services")
    .select("price_minor, tax_rate_bp, sac_code")
    .eq("org_id", org.id)
    .eq("kind", b.kind)
    .eq("is_default", true)
    .eq("is_active", true)
    .maybeSingle();
  if (service.error) return { error: friendlyError(service.error, t) };

  const typed = canManage ? typedMoney(form, "rate") : null;
  if (typed === undefined) return { error: e.priceNumber };
  const rateMinor = typed ?? service.data?.price_minor ?? null;
  if (rateMinor === null) return { error: (canManage ? e.noPriceManager : e.noPriceStaff)[b.kind] };

  const groupId = b.petIds.length > 1 ? crypto.randomUUID() : null;
  const { data, error } = await supabase
    .from("bookings")
    .insert(
      b.petIds.map((petId, i) => ({
        org_id: org.id,
        client_id: clientId,
        pet_id: petId,
        kind: b.kind,
        status: b.status,
        start_date: b.startDate,
        end_date: b.endDate,
        // A kennel is one pet's: the others are given theirs at check-in.
        kennel_id: i === 0 ? b.kennelId : null,
        rate_minor: rateMinor,
        tax_rate_bp: org.tax_mode === "none" ? 0 : (service.data?.tax_rate_bp ?? org.default_tax_rate_bp),
        sac_code: service.data?.sac_code ?? null,
        notes: b.notes,
        group_id: groupId,
      })),
    )
    .select("id");
  if (error) return { error: friendlyError(error, t) };

  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${data[0].id}?new=1`);
}

/**
 * Change a booking's dates, kennel, notes and belongings, and (owners and
 * managers only) its price and discount. Every date change goes through the
 * same database rules as a new booking.
 */
export async function updateBooking(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.booking.errors;
  const id = Id.safeParse(form.get("bookingId"));
  if (!id.success) return { error: t.m.errors.bookingNotFound };

  const supabase = await createClient();
  const current = await supabase.from("bookings").select("kind, status").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (current.error) return { error: friendlyError(current.error, t) };
  if (!current.data) return { error: t.m.errors.bookingNotFound };
  if (!["requested", "confirmed", "checked_in"].includes(current.data.status)) return { error: e.finished };

  const kind = current.data.kind;
  const start = text(form, "startDate");
  const stay = staySchema(t.m).safeParse({ kind, startDate: start, endDate: text(form, "endDate") ?? (kind === "daycare" ? start : null) });
  if (!stay.success) return { error: stay.error.issues[0].message };

  const kennel = text(form, "kennelId");
  if (kennel !== null && !Id.safeParse(kennel).success) return { error: e.kennelNotFound };
  const arrival = text(form, "expectedArrival");
  const departure = text(form, "expectedDeparture");
  for (const time of [arrival, departure]) if (time !== null && !clock.safeParse(time).success) return { error: e.clock };

  const update: TablesUpdate<"bookings"> = {
    start_date: stay.data.startDate,
    end_date: stay.data.endDate,
    kennel_id: kennel,
    expected_arrival: arrival,
    expected_departure: departure,
    notes: text(form, "notes"),
    belongings: text(form, "belongings"),
  };
  if (canManage) {
    const rate = typedMoney(form, "rate");
    const discount = typedMoney(form, "discount");
    if (rate === undefined || rate === null) return { error: e.priceWhole };
    if (discount === undefined) return { error: e.discountNumber };
    update.rate_minor = rate;
    update.discount_minor = discount ?? 0;
  }

  const { data, error } = await supabase.from("bookings").update(update).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.errors.bookingNotFound };

  revalidatePath("/app", "layout");
  return { ok: t.m.booking.saved };
}

/**
 * Change a booking's status from one of `from` to `to`, with an optional extra
 * change, then reopen the booking page saying what happened. (The form that
 * was pressed disappears once the status changes, and its message with it.)
 */
async function moveStatus(
  form: FormData,
  from: ("requested" | "confirmed" | "checked_in")[],
  to: "confirmed" | "cancelled" | "no_show",
  extra: TablesUpdate<"bookings"> = {},
): Promise<{ error?: string }> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("bookingId"));
  if (!id.success) return { error: t.m.errors.bookingNotFound };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ status: to, ...extra })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .in("status", from)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.booking.errors.changed };
  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${id.data}?done=${to}`);
}

/** Accept a request: from now on it holds space, so capacity is checked. */
export async function confirmRequest(_state: FormState, form: FormData): Promise<FormState> {
  return moveStatus(form, ["requested"], "confirmed");
}

export async function cancelBooking(_state: FormState, form: FormData): Promise<FormState> {
  await requireOrg();
  const { m } = await getAppI18n();
  const reason = text(form, "reason");
  if (!reason) return { error: m.booking.errors.cancelReason };
  if (reason.length > 500) return { error: m.booking.errors.cancelReasonLong };
  return moveStatus(form, ["requested", "confirmed"], "cancelled", { cancel_reason: reason });
}

export async function markNoShow(_state: FormState, form: FormData): Promise<FormState> {
  return moveStatus(form, ["confirmed"], "no_show");
}

/**
 * A pet still here after its check-out date keeps its kennel until today. The
 * database refuses this when the kennel is promised to another pet, and then
 * the sentence says what to do instead.
 */
export async function extendToToday(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.booking.errors;
  const id = Id.safeParse(form.get("bookingId"));
  if (!id.success) return { error: t.m.errors.bookingNotFound };
  const today = todayIn(org.time_zone);

  const supabase = await createClient();
  const current = await supabase
    .from("bookings")
    .select("status, end_date, kennel_id, kennels(name), pets(name)")
    .eq("org_id", org.id)
    .eq("id", id.data)
    .maybeSingle();
  if (current.error) return { error: friendlyError(current.error, t) };
  if (!current.data || current.data.status !== "checked_in") return { error: t.m.errors.notCheckedIn };
  if (current.data.end_date >= today) return { ok: t.m.booking.alreadyToday };

  const { error } = await supabase.from("bookings").update({ end_date: today }).eq("org_id", org.id).eq("id", id.data).eq("status", "checked_in");
  if (error) {
    if (current.data.kennel_id && `${error.message} ${error.details ?? ""}`.includes("bookings_no_kennel_overlap")) {
      const next = await supabase
        .from("bookings")
        .select("start_date, pets(name)")
        .eq("org_id", org.id)
        .eq("kennel_id", current.data.kennel_id)
        .in("status", ["confirmed", "checked_in"])
        .neq("id", id.data)
        .gte("start_date", current.data.end_date)
        .order("start_date")
        .limit(1)
        .maybeSingle();
      const names = { kennel: current.data.kennels?.name ?? e.thisKennel, pet: current.data.pets?.name ?? e.thisPet };
      return {
        error: next.data
          ? fill(e.promisedFrom, { ...names, other: next.data.pets?.name ?? e.anotherPet, date: formatDate(next.data.start_date, t.locale) })
          : fill(e.promised, names),
      };
    }
    return { error: friendlyError(error, t) };
  }
  revalidatePath("/app", "layout");
  if (form.get("from") === "booking") redirect(`/app/bookings/${id.data}?done=extended`);
  if (form.get("from") === "today") redirect("/app?done=extended");
  return { ok: fill(t.m.booking.extendedTo, { date: formatDate(today, t.locale) }) };
}

/** Add an extra from the price list (at its listed price) or a one-off item with its own price. */
export async function addExtra(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.booking.errors;
  const bookingId = Id.safeParse(form.get("bookingId"));
  if (!bookingId.success) return { error: t.m.errors.bookingNotFound };
  const quantityText = text(form, "quantity") ?? "1";
  const quantity = Number(quantityText);
  if (!/^\d{1,4}(\.\d{1,2})?$/.test(quantityText) || quantity <= 0) return { error: e.howMany };

  const supabase = await createClient();
  const serviceId = text(form, "serviceId");
  let item: { service_id: string | null; description: string; unit_price_minor: number; tax_rate_bp: number; sac_code: string | null };
  if (serviceId) {
    if (!Id.safeParse(serviceId).success) return { error: e.chooseExtra };
    const s = await supabase.from("services").select("id, name, price_minor, tax_rate_bp, sac_code").eq("org_id", org.id).eq("id", serviceId).eq("is_active", true).maybeSingle();
    if (s.error) return { error: friendlyError(s.error, t) };
    if (!s.data) return { error: e.extraGone };
    item = {
      service_id: s.data.id,
      description: s.data.name,
      unit_price_minor: s.data.price_minor,
      tax_rate_bp: org.tax_mode === "none" ? 0 : (s.data.tax_rate_bp ?? org.default_tax_rate_bp),
      sac_code: s.data.sac_code,
    };
  } else {
    const description = text(form, "description");
    const price = typedMoney(form, "price");
    if (!description) return { error: e.extraOrDescribe };
    if (description.length > 200) return { error: e.descriptionLong };
    if (price === undefined || price === null) return { error: e.itemPrice };
    item = { service_id: null, description, unit_price_minor: price, tax_rate_bp: org.tax_mode === "none" ? 0 : org.default_tax_rate_bp, sac_code: null };
  }

  const { error } = await supabase.from("booking_items").insert({ org_id: org.id, booking_id: bookingId.data, quantity, ...item });
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  return { ok: fill(t.m.booking.added, { item: item.description }) };
}

export async function removeExtra(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  if (!canManage) return { error: t.m.booking.errors.removeExtra };
  const id = Id.safeParse(form.get("itemId"));
  if (!id.success) return { error: t.m.booking.errors.extraNotFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("booking_items").delete().eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.booking.errors.extraNotFound };
  revalidatePath("/app", "layout");
  return { ok: t.m.booking.extraRemoved };
}
