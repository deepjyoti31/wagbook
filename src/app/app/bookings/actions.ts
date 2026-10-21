"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { diffDays, formatDate, isISODate, parseMoney, payFromPacks, seriesDates, todayIn } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { searchPets, type PetChoice } from "@/lib/pet-search";
import { fill } from "@/lib/i18n";
import { getAppI18n, type I18n } from "@/lib/i18n-server";
import type { TablesInsert, TablesUpdate } from "@/lib/supabase/database.types";
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
 * none is. Two of them may share one kennel: then both get the chosen kennel,
 * and the second the shared kennel price, if the price list has one. Staff
 * book at the usual price; only owners and managers can type a different one
 * (the database refuses anything else, see bookings_guard_price).
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
    status: form.get("intent") === "requested" || form.get("intent") === "waitlist" ? "requested" : "confirmed",
  });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const b = { ...parsed.data, ...stay.data };
  const together = form.get("sharing") === "together";
  if (together && b.petIds.length !== 2) return { error: e.shareTwo };
  if (together && !b.kennelId) return { error: e.shareKennel };

  const supabase = await createClient();

  // The pets decide the parent. Reading them through our own session also proves they belong to this organisation.
  const pets = await supabase.from("pets").select("id, client_id").eq("org_id", org.id).in("id", b.petIds).is("deleted_at", null);
  if (pets.error) return { error: friendlyError(pets.error, t) };
  if (pets.data.length !== b.petIds.length) return { error: t.m.errors.petNotFound };
  const clientId = pets.data[0].client_id;
  if (pets.data.some((p) => p.client_id !== clientId)) return { error: e.sameParent };

  const service = await supabase
    .from("services")
    .select("price_minor, shared_price_minor, tax_rate_bp, sac_code")
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

  // Day boarding that repeats (D37): one booking a day, sharing a series id, for one pet.
  const repeatDays = form.getAll("repeat_day").map(Number);
  const repeatUntil = text(form, "repeat_until");
  let days: string[] | null = null;
  if (repeatDays.length > 0 || repeatUntil) {
    if (b.kind !== "daycare") return { error: e.repeatDaycare };
    if (b.petIds.length !== 1) return { error: e.repeatOnePet };
    days = seriesDates(b.startDate, repeatUntil ?? "", repeatDays);
    if (!days) return { error: e.repeatDates };
  }

  // Days paid from the parent's day boarding packs, when asked: the pack that ends soonest first.
  const firstDay = days?.[0] ?? b.startDate;
  const lastDay = days?.[days.length - 1] ?? b.endDate;
  let packFor: (string | null)[] = [];
  if (b.kind === "daycare" && checked(form, "use_pack")) {
    const packs = await supabase
      .from("pass_balances")
      .select("pass_id, starts_on, valid_until, days_left")
      .eq("org_id", org.id)
      .eq("client_id", clientId)
      .gt("days_left", 0)
      .lte("starts_on", lastDay)
      .gte("valid_until", firstDay);
    if (packs.error) return { error: friendlyError(packs.error, t) };
    const usable = packs.data.map((p) => ({ id: p.pass_id as string, startsOn: p.starts_on as string, validUntil: p.valid_until as string, daysLeft: p.days_left ?? 0 }));
    if (days) packFor = payFromPacks(days, usable);
    else {
      // One stay of one or more days, for each pet: a pack must cover all of it.
      const units = diffDays(b.startDate, b.endDate) + 1;
      const left = new Map(usable.map((p) => [p.id, p.daysLeft]));
      packFor = b.petIds.map(() => {
        const pack = [...usable]
          .sort((x, y) => x.validUntil.localeCompare(y.validUntil))
          .find((p) => p.startsOn <= b.startDate && b.endDate <= p.validUntil && (left.get(p.id) ?? 0) >= units);
        if (!pack) return null;
        left.set(pack.id, (left.get(pack.id) ?? 0) - units);
        return pack.id;
      });
    }
  }
  const paid = (i: number): Partial<TablesInsert<"bookings">> => (packFor[i] ? { rate_minor: 0, alone_rate_minor: null, pass_id: packFor[i] } : {});

  const groupId = b.petIds.length > 1 ? crypto.randomUUID() : null;
  const seriesId = days ? crypto.randomUUID() : null;
  // The second of two sharing pays the shared kennel price, and the usual price for any night it has the kennel to itself.
  const sharedMinor = together ? (service.data?.shared_price_minor ?? null) : null;
  // A request that waits for a kennel (D42). The database stamps its place in line with the real time.
  const waitlisted_at = form.get("intent") === "waitlist" ? new Date().toISOString() : null;
  const base = {
    org_id: org.id,
    client_id: clientId,
    kind: b.kind,
    status: b.status,
    waitlisted_at,
    tax_rate_bp: org.tax_mode === "none" ? 0 : (service.data?.tax_rate_bp ?? org.default_tax_rate_bp),
    sac_code: service.data?.sac_code ?? null,
    notes: b.notes,
  };
  const rows: TablesInsert<"bookings">[] = days
    ? days.map((d, i) => ({ ...base, pet_id: b.petIds[0], start_date: d, end_date: d, kennel_id: b.kennelId, rate_minor: rateMinor, series_id: seriesId, ...paid(i) }))
    : b.petIds.map((petId, i) => ({
        org_id: org.id,
        client_id: clientId,
        pet_id: petId,
        kind: b.kind,
        status: b.status,
        start_date: b.startDate,
        end_date: b.endDate,
        // Two sharing get the one kennel. Otherwise it is the first pet's, and the others are given theirs at check-in.
        kennel_id: i === 0 || together ? b.kennelId : null,
        rate_minor: i === 1 && sharedMinor !== null ? sharedMinor : rateMinor,
        alone_rate_minor: i === 1 && sharedMinor !== null ? rateMinor : null,
        tax_rate_bp: base.tax_rate_bp,
        sac_code: base.sac_code,
        notes: b.notes,
        group_id: groupId,
        waitlisted_at,
        ...paid(i),
      }));
  const { data, error } = await supabase.from("bookings").insert(rows).select("id");
  if (error) return { error: friendlyError(error, t) };

  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${data[0].id}?new=1`);
}

/**
 * Change a booking's dates, kennel, notes and belongings, and (owners and
 * managers only) its price, discount and kind of stay. Every date change goes through the
 * same database rules as a new booking.
 */
export async function updateBooking(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.booking.errors;
  const id = Id.safeParse(form.get("bookingId"));
  if (!id.success) return { error: t.m.errors.bookingNotFound };

  const supabase = await createClient();
  const current = await supabase.from("bookings").select("kind, status, boarding_from, alone_rate_minor").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (current.error) return { error: friendlyError(current.error, t) };
  if (!current.data) return { error: t.m.errors.bookingNotFound };
  if (!["requested", "confirmed", "checked_in"].includes(current.data.status)) return { error: e.finished };

  // Only owners and managers change the kind of stay (WB022), because it changes how the stay is priced.
  const typedKind = form.get("kind");
  const kind = canManage && (typedKind === "boarding" || typedKind === "daycare") ? typedKind : current.data.kind;
  const start = text(form, "startDate");
  const stay = staySchema(t.m).safeParse({ kind, startDate: start, endDate: text(form, "endDate") ?? (kind === "daycare" ? start : null) });
  if (!stay.success) return { error: stay.error.issues[0].message };

  const kennel = text(form, "kennelId");
  if (kennel !== null && !Id.safeParse(kennel).success) return { error: e.kennelNotFound };
  const arrival = text(form, "expectedArrival");
  const departure = text(form, "expectedDeparture");
  for (const time of [arrival, departure]) if (time !== null && !clock.safeParse(time).success) return { error: e.clock };

  const update: TablesUpdate<"bookings"> = {
    // A new kind of stay applies to the whole stay, so any part that was day boarding goes.
    ...(kind !== current.data.kind ? { kind, boarding_from: null, day_rate_minor: null } : {}),
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
    // The price for nights alone, on a pet booked at the shared kennel price. Empty: the price above throughout.
    if (current.data.alone_rate_minor !== null && form.has("aloneRate")) {
      const alone = typedMoney(form, "aloneRate");
      if (alone === undefined) return { error: e.priceWhole };
      update.alone_rate_minor = alone;
    }
    if (current.data.boarding_from !== null && kind === current.data.kind && form.has("dayRate")) {
      const day = typedMoney(form, "dayRate");
      if (day === undefined || day === null) return { error: e.priceWhole };
      update.day_rate_minor = day;
    }
  }

  const { data, error } = await supabase.from("bookings").update(update).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.errors.bookingNotFound };

  revalidatePath("/app", "layout");
  return { ok: t.m.booking.saved };
}

/**
 * Day boarding that now stays nights. The days before the first night stay
 * day boarding at their price, the nights from it on are boarding at the
 * price per night, and both go on the bill (stay_charges() in the database).
 * A first night on or before the first day turns the whole stay into
 * boarding. Owners and managers only (the database refuses staff, WB022).
 */
export async function switchToBoarding(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.booking.errors;
  const id = Id.safeParse(form.get("bookingId"));
  if (!id.success) return { error: t.m.errors.bookingNotFound };
  const firstNight = text(form, "firstNight");
  const endDate = text(form, "endDate");
  if (!isISODate(firstNight)) return { error: e.firstNight };
  if (!isISODate(endDate)) return { error: e.validDate };
  if (endDate <= firstNight) return { error: e.checkOutAfterNight };
  const rate = typedMoney(form, "rate");
  if (rate === undefined || rate === null) return { error: e.priceWhole };

  const supabase = await createClient();
  const current = await supabase.from("bookings").select("kind, status, start_date, rate_minor").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (current.error) return { error: friendlyError(current.error, t) };
  if (!current.data) return { error: t.m.errors.bookingNotFound };
  if (!["requested", "confirmed", "checked_in"].includes(current.data.status)) return { error: e.finished };
  if (current.data.kind !== "daycare") return { error: e.onlyDaycare };

  const split = firstNight > current.data.start_date;
  const { data, error } = await supabase
    .from("bookings")
    .update({
      kind: "boarding",
      end_date: endDate,
      rate_minor: rate,
      boarding_from: split ? firstNight : null,
      day_rate_minor: split ? current.data.rate_minor : null,
      // A price for nights alone belonged to the day boarding price; the new price per night is the manager's.
      alone_rate_minor: null,
    })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .eq("kind", "daycare")
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.changed };

  revalidatePath("/app", "layout");
  // The form goes once the stay is boarding, and its message with it; the page says what happened instead.
  redirect(`/app/bookings/${id.data}?done=boarding`);
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

/** Accept a request: from now on it holds space, so capacity is checked. It leaves the waiting list. */
export async function confirmRequest(_state: FormState, form: FormData): Promise<FormState> {
  return moveStatus(form, ["requested"], "confirmed");
}

/**
 * Put a request on the waiting list, or take it off (D42). Anyone may: staff
 * take the calls. The database stamps the time it joined, which is its place
 * in line, and clears it when the request is answered.
 */
export async function setWaitlist(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("bookingId"));
  if (!id.success) return { error: t.m.errors.bookingNotFound };
  const join = form.get("intent") === "join";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("bookings")
    .update({ waitlisted_at: join ? new Date().toISOString() : null })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .eq("status", "requested")
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.booking.errors.changed };
  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${id.data}?done=${join ? "waitlisted" : "unwaitlisted"}`);
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

/** Delete an extra from a booking. Owners only (D29). */
export async function removeExtra(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete } = await requireOrg();
  const t = await getAppI18n();
  if (!canDelete) return { error: t.m.errors.ownersDelete };
  const id = Id.safeParse(form.get("itemId"));
  if (!id.success) return { error: t.m.booking.errors.extraNotFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("booking_items").delete().eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: t.m.booking.errors.extraNotFound };
  revalidatePath("/app", "layout");
  return { ok: t.m.booking.extraRemoved };
}

/**
 * Pets matching what was typed in New booking's search box, with their
 * families. Called by the picker as the person types; nothing changes.
 */
export async function findPets(query: string): Promise<PetChoice[]> {
  const { org } = await requireOrg();
  if (typeof query !== "string") return [];
  try {
    return await searchPets(await createClient(), org.id, query);
  } catch {
    return [];
  }
}

/**
 * Cancel this day of a repeating series and every later day not yet started
 * (D37). Anyone who may cancel a booking; a reason is required, as for one.
 */
export async function cancelSeriesRest(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const e = t.m.booking.errors;
  const id = Id.safeParse(form.get("bookingId"));
  if (!id.success) return { error: t.m.errors.bookingNotFound };
  const reason = text(form, "reason");
  if (!reason) return { error: e.cancelReason };
  if (reason.length > 500) return { error: e.cancelReasonLong };
  const supabase = await createClient();
  const current = await supabase.from("bookings").select("series_id, start_date").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (current.error) return { error: friendlyError(current.error, t) };
  if (!current.data?.series_id) return { error: t.m.errors.bookingNotFound };
  const { error } = await supabase
    .from("bookings")
    .update({ status: "cancelled", cancel_reason: reason })
    .eq("org_id", org.id)
    .eq("series_id", current.data.series_id)
    .gte("start_date", current.data.start_date)
    .in("status", ["requested", "confirmed"]);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${id.data}?done=series_cancelled`);
}

/**
 * Pay a day boarding booking from the parent's pack (D37): the pack that ends
 * soonest among those covering its days with enough left. Staff may do it;
 * the database checks the pack (bookings_check_pass) and refuses taking a day
 * back off a pack to anyone but owners and managers.
 */
export async function payFromPack(_state: FormState, form: FormData): Promise<FormState> {
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const id = Id.safeParse(form.get("bookingId"));
  if (!id.success) return { error: t.m.errors.bookingNotFound };
  const supabase = await createClient();
  const b = await supabase.from("bookings").select("client_id, kind, start_date, end_date, pass_id, pet_id").eq("org_id", org.id).eq("id", id.data).maybeSingle();
  if (b.error) return { error: friendlyError(b.error, t) };
  if (!b.data || b.data.kind !== "daycare" || b.data.pass_id) return { error: t.m.errors.bookingNotFound };
  const units = diffDays(b.data.start_date, b.data.end_date) + 1;
  const packs = await supabase
    .from("pass_balances")
    .select("pass_id, days_left")
    .eq("org_id", org.id)
    .eq("client_id", b.data.client_id)
    .lte("starts_on", b.data.start_date)
    .gte("valid_until", b.data.end_date)
    .gte("days_left", units)
    .order("valid_until")
    .limit(1);
  if (packs.error) return { error: friendlyError(packs.error, t) };
  const pass = packs.data[0]?.pass_id;
  if (!pass) return { error: t.m.booking.errors.noPack };
  const { error } = await supabase.from("bookings").update({ pass_id: pass, rate_minor: 0 }).eq("org_id", org.id).eq("id", id.data).is("pass_id", null);
  if (error) return { error: friendlyError(error, t) };
  revalidatePath("/app", "layout");
  redirect(`/app/bookings/${id.data}?done=pack`);
}
