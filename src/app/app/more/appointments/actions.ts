"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrg } from "@/lib/auth";
import { APPOINTMENT_KINDS, isSacCode, PACKAGE_DAYS, parseMoney, parseRatePercent, PET_COATS, PRICINGS, SIZE_BANDS } from "@/lib/core";
import { friendlyError } from "@/lib/errors";
import { checked, text, type FormState } from "@/lib/forms";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

const Id = z.uuid();
const Clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const SKILLS = ["groomer", "trainer", "swim_supervisor"] as const;

/** Owners and managers set up appointments (setup tables, 0008); the database says so too. */
async function manager() {
  const ctx = await requireOrg();
  const t = await getAppI18n();
  return { ...ctx, t, e: t.m.appointmentSetup.errors };
}

function done(name?: string): FormState {
  revalidatePath("/app", "layout");
  return name ? { ok: name } : { ok: "" };
}

/** The tax rate and code typed for a service or package (D35): empty rate is the kennel's usual rate. */
function taxOf(form: FormData, e: { rate: string; sac: string }): { tax_rate_bp: number | null; sac_code: string | null } | { error: string } {
  if (!form.has("rate")) return { tax_rate_bp: null, sac_code: null };
  const rate = parseRatePercent(text(form, "rate"));
  if (rate === undefined) return { error: e.rate };
  const sac = text(form, "sac");
  if (sac !== null && !isSacCode(sac)) return { error: e.sac };
  return { tax_rate_bp: rate, sac_code: sac };
}

/** Add a place that takes one appointment at a time, with its hours. */
export async function addPlace(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage, t, e } = await manager();
  if (!canManage) return { error: e.onlyManagers };
  const name = text(form, "name");
  if (!name || name.length > 60) return { error: e.name };
  const opens = Clock.safeParse(text(form, "opens") ?? "09:00");
  const closes = Clock.safeParse(text(form, "closes") ?? "18:00");
  if (!opens.success || !closes.success || closes.data <= opens.data) return { error: e.hours };
  const supabase = await createClient();
  const { error } = await supabase.from("appointment_places").insert({ org_id: org.id, name, opens: opens.data, closes: closes.data });
  if (error) return { error: friendlyError(error, t) };
  return done(fill(t.m.appointmentSetup.added, { name }));
}

/** Change a place's hours, or take it out of service and back. */
export async function savePlace(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage, t, e } = await manager();
  if (!canManage) return { error: e.onlyManagers };
  const id = Id.safeParse(form.get("placeId"));
  if (!id.success) return { error: e.notFound };
  const opens = Clock.safeParse(text(form, "opens"));
  const closes = Clock.safeParse(text(form, "closes"));
  if (!opens.success || !closes.success || closes.data <= opens.data) return { error: e.hours };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("appointment_places")
    .update({ opens: opens.data, closes: closes.data, is_active: checked(form, "is_active") })
    .eq("org_id", org.id)
    .eq("id", id.data)
    .select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  return done(t.m.appointmentSetup.saved);
}

/** Add a service booked by the hour, or an add-on priced on top of one. */
export async function addService(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage, t, e } = await manager();
  if (!canManage) return { error: e.onlyManagers };
  const name = text(form, "name");
  if (!name || name.length > 80) return { error: e.name };
  const kind = z.enum(APPOINTMENT_KINDS).catch("other").parse(form.get("kind"));
  const pricing = z.enum(PRICINGS).catch("fixed").parse(form.get("pricing"));
  const addon = checked(form, "is_addon");
  const minutes = addon ? 0 : Number(text(form, "minutes"));
  if (!addon && (!Number.isInteger(minutes) || minutes < 5 || minutes > 720)) return { error: e.minutes };
  const cleanup = addon ? 0 : Number(text(form, "cleanup") ?? "0");
  if (!Number.isInteger(cleanup) || cleanup < 0 || cleanup > 240) return { error: e.cleanup };
  const place = addon ? null : Id.safeParse(form.get("placeId"));
  if (place && !place.success) return { error: e.place };
  const priceText = text(form, "price");
  const price = pricing === "quote" && priceText === null ? 0 : parseMoney(priceText ?? "");
  if (price === null || price < 0) return { error: e.price };
  const peopleText = text(form, "max_people");
  const people = peopleText === null ? null : Number(peopleText);
  if (people !== null && (!Number.isInteger(people) || people < 1 || people > 100)) return { error: e.people };
  const tax = taxOf(form, e);
  if ("error" in tax) return tax;
  const skill = z.enum(SKILLS).nullable().catch(null).parse(text(form, "skill"));
  const supabase = await createClient();
  const { error } = await supabase.from("appointment_services").insert({
    org_id: org.id,
    kind,
    name,
    minutes,
    cleanup_minutes: cleanup,
    place_id: place ? place.data : null,
    pricing,
    price_minor: price,
    skill,
    checks_vaccinations: checked(form, "checks_vaccinations"),
    is_addon: addon,
    max_people: people,
    ...tax,
  });
  if (error) return { error: friendlyError(error, t) };
  return done(fill(t.m.appointmentSetup.added, { name }));
}

/** Take a service off the list. Appointments already booked keep their price. */
export async function removeService(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage, t, e } = await manager();
  if (!canManage) return { error: e.onlyManagers };
  const id = Id.safeParse(form.get("serviceId"));
  if (!id.success) return { error: e.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointment_services").update({ is_active: false }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  return done(t.m.appointmentSetup.removed);
}

/** A service's price for a size, a coat or a breed. Typing one again changes it. */
export async function setServicePrice(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage, t, e } = await manager();
  if (!canManage) return { error: e.onlyManagers };
  const id = Id.safeParse(form.get("serviceId"));
  if (!id.success) return { error: e.notFound };
  const price = parseMoney(text(form, "price") ?? "");
  if (price === null || price < 0) return { error: e.price };
  const size = z.enum(SIZE_BANDS).nullable().catch(null).parse(text(form, "size"));
  const coat = z.enum(PET_COATS).nullable().catch(null).parse(text(form, "coat"));
  const breed = text(form, "breed");
  if (breed && breed.length > 80) return { error: e.name };
  const key = breed ? { size: null, coat: null, breed } : coat ? { size: null, coat, breed: null } : size ? { size, coat: null, breed: null } : null;
  if (!key) return { error: e.priceKey };
  const supabase = await createClient();
  let existing = supabase.from("appointment_service_prices").select("id, breed").eq("org_id", org.id).eq("service_id", id.data);
  existing = key.size ? existing.eq("size", key.size) : key.coat ? existing.eq("coat", key.coat) : existing.not("breed", "is", null);
  const found = await existing;
  if (found.error) return { error: friendlyError(found.error, t) };
  const same = found.data.find((p) => !key.breed || p.breed?.trim().toLowerCase() === key.breed.trim().toLowerCase());
  const { error } = same
    ? await supabase.from("appointment_service_prices").update({ price_minor: price }).eq("org_id", org.id).eq("id", same.id)
    : await supabase.from("appointment_service_prices").insert({ org_id: org.id, service_id: id.data, ...key, price_minor: price });
  if (error) return { error: friendlyError(error, t) };
  return done(t.m.appointmentSetup.saved);
}

/** Owners remove a price that is no longer wanted (D29). */
export async function removeServicePrice(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete, t, e } = await manager();
  if (!canDelete) return { error: t.m.errors.codes.WB002 };
  const id = Id.safeParse(form.get("priceId"));
  if (!id.success) return { error: e.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("appointment_service_prices").delete().eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  return done(t.m.appointmentSetup.removed);
}

/** Add a package: a stay with appointments and extras, at one price or on request. */
export async function addPackage(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage, t, e } = await manager();
  if (!canManage) return { error: e.onlyManagers };
  const name = text(form, "name");
  if (!name || name.length > 80) return { error: e.name };
  const kind = form.get("kind") === "daycare" ? "daycare" : "boarding";
  const priceText = text(form, "price");
  const price = priceText === null ? null : parseMoney(priceText);
  if (priceText !== null && (price === null || price < 0)) return { error: e.price };
  const about = text(form, "about");
  if ((about?.length ?? 0) > 500) return { error: e.name };
  const tax = taxOf(form, e);
  if ("error" in tax) return tax;
  const supabase = await createClient();
  const { error } = await supabase.from("packages").insert({ org_id: org.id, name, kind, price_minor: price, about, ...tax });
  if (error) return { error: friendlyError(error, t) };
  return done(fill(t.m.appointmentSetup.added, { name }));
}

/** Take a package off the list. Stays booked as it keep it. */
export async function removePackage(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage, t, e } = await manager();
  if (!canManage) return { error: e.onlyManagers };
  const id = Id.safeParse(form.get("packageId"));
  if (!id.success) return { error: e.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("packages").update({ is_active: false }).eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  return done(t.m.appointmentSetup.removed);
}

/** Put an appointment on a day of the stay, or an extra so many times, into a package. */
export async function addPackagePart(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canManage, t, e } = await manager();
  if (!canManage) return { error: e.onlyManagers };
  const pkg = Id.safeParse(form.get("packageId"));
  if (!pkg.success) return { error: e.notFound };
  const service = Id.safeParse(form.get("serviceId"));
  const extra = Id.safeParse(form.get("extraId"));
  const quantity = Number(text(form, "quantity") ?? "1");
  if (service.success === extra.success) return { error: e.partChoose };
  if (extra.success && (!Number.isInteger(quantity) || quantity < 1 || quantity > 50)) return { error: e.quantity };
  const day = z.enum(PACKAGE_DAYS).catch("first").parse(form.get("on_day"));
  const supabase = await createClient();
  const { error } = await supabase.from("package_parts").insert(
    service.success
      ? { org_id: org.id, package_id: pkg.data, service_id: service.data, on_day: day, quantity: 1 }
      : { org_id: org.id, package_id: pkg.data, extra_id: extra.data, quantity },
  );
  if (error) return { error: friendlyError(error, t) };
  return done(t.m.appointmentSetup.saved);
}

/** Owners take a part out of a package (D29). Stays already booked keep theirs. */
export async function removePackagePart(_state: FormState, form: FormData): Promise<FormState> {
  const { org, canDelete, t, e } = await manager();
  if (!canDelete) return { error: t.m.errors.codes.WB002 };
  const id = Id.safeParse(form.get("partId"));
  if (!id.success) return { error: e.notFound };
  const supabase = await createClient();
  const { data, error } = await supabase.from("package_parts").delete().eq("org_id", org.id).eq("id", id.data).select("id");
  if (error) return { error: friendlyError(error, t) };
  if (data.length === 0) return { error: e.notFound };
  return done(t.m.appointmentSetup.removed);
}
