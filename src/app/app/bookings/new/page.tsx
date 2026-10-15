import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { FamilyPicker } from "@/components/family-picker";
import { buttonStyles, Empty, Field, Input, Loading, PageTitle, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatMoney, isISODate, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { createBooking } from "../actions";

export const generateMetadata = () => appTitle((m) => m.newBooking.title);

export default function NewBookingPage({ searchParams }: PageProps<"/app/bookings/new">) {
  return (
    <Suspense fallback={<Loading />}>
      <NewBookingForm searchParams={searchParams} />
    </Suspense>
  );
}

async function NewBookingForm({ searchParams }: Pick<PageProps<"/app/bookings/new">, "searchParams">) {
  const params = await searchParams;
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const w = m.newBooking;
  const supabase = await createClient();

  const [pets, kennels, services] = await Promise.all([
    supabase.from("pets").select("id, name, breed, client_id, clients(full_name)").eq("org_id", org.id).is("deleted_at", null).order("name").limit(2000),
    supabase.from("kennels").select("id, name").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("services").select("kind, price_minor").eq("org_id", org.id).eq("is_default", true).eq("is_active", true),
  ]);
  if (pets.error || kennels.error || services.error) throw new Error("Could not load the booking form.");

  if (pets.data.length === 0) {
    return (
      <>
        <PageTitle title={w.title} />
        <Empty>
          {w.addPetFirst}{" "}
          <Link href="/app/dogs/new" className="font-semibold text-ink underline underline-offset-4">
            {w.addPet}
          </Link>
        </Empty>
      </>
    );
  }

  const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const start = pick(params.start);
  const end = pick(params.end);
  const kennel = pick(params.kennel);
  const price = (kind: string) => {
    const s = services.data.find((x) => x.kind === kind);
    return s ? formatMoney(s.price_minor, { currency: org.currency, locale, trimZeros: true }) : null;
  };
  const boarding = price("boarding");
  const daycare = price("daycare");
  const usual =
    boarding && daycare
      ? fill(w.usualBoth, { boarding, daycare })
      : boarding
        ? fill(w.usualBoarding, { boarding })
        : daycare
          ? fill(w.usualDaycare, { daycare })
          : "";

  return (
    <>
      <PageTitle title={w.title} />
      <ActionForm action={createBooking}>
        <FamilyPicker
          words={w.picker}
          defaultPetId={pick(params.pet)}
          pets={pets.data.map((p) => ({ id: p.id, name: p.name, breed: p.breed, clientId: p.client_id, parentName: p.clients?.full_name ?? null }))}
        />
        <Field label={w.stay}>
          <Select name="kind" defaultValue={pick(params.kind) === "daycare" ? "daycare" : "boarding"}>
            <option value="boarding">{w.boarding}</option>
            <option value="daycare">{w.daycare}</option>
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={w.checkInDate}>
            <Input name="startDate" type="date" required defaultValue={start && isISODate(start) ? start : todayIn(org.time_zone)} />
          </Field>
          <Field label={w.checkOutDate} hint={w.checkOutHint}>
            <Input name="endDate" type="date" defaultValue={end && isISODate(end) ? end : undefined} />
          </Field>
        </div>
        <Field label={w.kennel} hint={w.kennelHint}>
          <Select name="kennelId" defaultValue={kennel && kennels.data.some((k) => k.id === kennel) ? kennel : ""}>
            <option value="">{w.decideAtCheckIn}</option>
            {kennels.data.map((k) => (
              <option key={k.id} value={k.id}>
                {k.name}
              </option>
            ))}
          </Select>
        </Field>
        {canManage ? (
          <Field label={w.price} hint={usual ? fill(w.leaveEmpty, { usual }) : w.noUsualHint}>
            <Input name="rate" inputMode="decimal" placeholder={boarding ?? undefined} />
          </Field>
        ) : (
          <p className="text-slate">
            {usual ? fill(w.pricedAt, { usual }) : w.noUsual} {w.onlyManagers}
          </p>
        )}
        <Field label={w.notes}>
          <Textarea name="notes" maxLength={2000} />
        </Field>
        <div className="flex flex-wrap gap-3">
          <SubmitButton name="intent" value="confirmed" pendingLabel={w.booking}>
            {w.confirm}
          </SubmitButton>
          <SubmitButton name="intent" value="requested" variant="secondary" pendingLabel={m.common.saving}>
            {w.saveAsRequest}
          </SubmitButton>
          <Link href="/app/bookings" className={buttonStyles.quiet}>
            {w.back}
          </Link>
        </div>
        <p className="text-sm text-slate">{w.requestNote}</p>
      </ActionForm>
    </>
  );
}
