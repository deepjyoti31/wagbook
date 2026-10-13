import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Empty, Field, Input, Loading, PageTitle, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatMoney, isISODate, todayIn } from "@/lib/core";
import { createClient } from "@/lib/supabase/server";
import { createBooking } from "../actions";

export const metadata: Metadata = { title: "New booking" };

export default function NewBookingPage({ searchParams }: PageProps<"/app/bookings/new">) {
  return (
    <>
      <PageTitle title="New booking" />
      <Suspense fallback={<Loading />}>
        <NewBookingForm searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function NewBookingForm({ searchParams }: Pick<PageProps<"/app/bookings/new">, "searchParams">) {
  const params = await searchParams;
  const { org } = await requireOrg();
  const supabase = await createClient();

  const [pets, kennels, services] = await Promise.all([
    supabase.from("pets").select("id, name, breed, clients(full_name)").eq("org_id", org.id).is("deleted_at", null).order("name").limit(2000),
    supabase.from("kennels").select("id, name").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("services").select("kind, price_minor").eq("org_id", org.id).eq("is_default", true).eq("is_active", true),
  ]);
  if (pets.error || kennels.error || services.error) throw new Error("Could not load the booking form.");

  if (pets.data.length === 0) {
    return (
      <Empty>
        Add a pet before making a booking.{" "}
        <Link href="/app/dogs/new" className="font-semibold text-ink underline underline-offset-4">
          Add a pet
        </Link>
      </Empty>
    );
  }

  const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const start = pick(params.start);
  const end = pick(params.end);
  const price = (kind: string) => {
    const s = services.data.find((x) => x.kind === kind);
    return s ? formatMoney(s.price_minor, { currency: org.currency, locale: org.locale, trimZeros: true }) : null;
  };
  const boarding = price("boarding");
  const daycare = price("daycare");
  const priceHint =
    boarding || daycare
      ? `Leave empty to use your usual price${boarding ? ` (${boarding} a night` : " ("}${boarding && daycare ? ", " : ""}${daycare ? `${daycare} a day for day boarding` : ""}).`
      : "Per night for boarding, per day for day boarding. Set your usual prices in Settings to skip this.";

  return (
    <ActionForm action={createBooking}>
      <Field label="Pet">
        <Select name="petId" required defaultValue={pick(params.pet) ?? ""}>
          <option value="" disabled>
            Choose a pet
          </option>
          {pets.data.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.breed ? `, ${p.breed}` : ""}
              {p.clients ? ` (${p.clients.full_name})` : ""}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Stay">
        <Select name="kind" defaultValue="boarding">
          <option value="boarding">Boarding (overnight)</option>
          <option value="daycare">Day boarding (no night)</option>
        </Select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Check-in date">
          <Input name="startDate" type="date" required defaultValue={start && isISODate(start) ? start : todayIn(org.time_zone)} />
        </Field>
        <Field label="Check-out date" hint="For a single day of day boarding, leave this empty.">
          <Input name="endDate" type="date" defaultValue={end && isISODate(end) ? end : undefined} />
        </Field>
      </div>
      <Field label="Kennel" hint="You can leave this until check-in. Space is still held.">
        <Select name="kennelId" defaultValue="">
          <option value="">Decide at check-in</option>
          {kennels.data.map((k) => (
            <option key={k.id} value={k.id}>
              {k.name}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Price" hint={priceHint}>
        <Input name="rate" inputMode="decimal" placeholder={boarding ?? undefined} />
      </Field>
      <Field label="Notes for staff">
        <Textarea name="notes" maxLength={2000} />
      </Field>
      <div className="flex flex-wrap gap-3">
        <SubmitButton pendingLabel="Booking">Confirm booking</SubmitButton>
        <Link href="/app/bookings" className={buttonStyles.quiet}>
          Back to bookings
        </Link>
      </div>
    </ActionForm>
  );
}
