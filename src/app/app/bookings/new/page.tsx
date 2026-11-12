import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { NewBookingFields } from "@/components/new-booking-fields";
import { Empty, Loading, PageTitle } from "@/components/ui";
import { Icon } from "@/components/icons";
import { requireOrg } from "@/lib/auth";
import { addDays, formatMoney, isISODate, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { hasPets, startingPets } from "@/lib/pet-search";
import { createBooking, findPets, petFacts } from "../actions";

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
  const { m, language, locale } = await getAppI18n();
  const w = m.newBooking;
  const supabase = await createClient();

  const today = todayIn(org.time_zone);
  const pick = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined);
  const askedPet = pick(params.pet);
  // Recent pets to start with; the search box finds the rest on the server.
  const [anyPet, pets, kennels, services, holds] = await Promise.all([
    hasPets(supabase, org.id),
    startingPets(supabase, org.id, askedPet && /^[0-9a-f-]{36}$/.test(askedPet) ? askedPet : undefined),
    supabase.from("kennels").select("id, name").eq("org_id", org.id).eq("is_active", true).order("sort_order").order("name"),
    supabase.from("services").select("kind, price_minor, shared_price_minor").eq("org_id", org.id).eq("is_default", true).eq("is_active", true),
    // Stays that hold a kennel from yesterday on, the same rule as available_kennels().
    supabase
      .from("bookings")
      .select("kennel_id, client_id, kind, start_date, end_date")
      .eq("org_id", org.id)
      .in("status", ["confirmed", "checked_in"])
      .not("kennel_id", "is", null)
      .gte("end_date", addDays(today, -1))
      .limit(5000),
  ]);
  if (kennels.error || services.error || holds.error) throw new Error("Could not load the booking form.");

  if (!anyPet) {
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

  const start = pick(params.start);
  const end = pick(params.end);
  const kennel = pick(params.kennel);
  const money = (minor: number | null | undefined) => (minor == null ? null : formatMoney(minor, { currency: org.currency, locale, trimZeros: true }));
  const price = (kind: string) => money(services.data.find((x) => x.kind === kind)?.price_minor);
  const sharedPrice = (kind: string) => money(services.data.find((x) => x.kind === kind)?.shared_price_minor);
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

  // The reminder goes to the parent, in the kennel's language for parents.
  const parent = parentI18n(org.parent_language, org.locale);
  const symbol = new Intl.NumberFormat(locale, { style: "currency", currency: org.currency }).formatToParts(0).find((part) => part.type === "currency")?.value ?? "";

  return (
    <>
      <Link href="/app/bookings" className="mb-2 inline-flex min-h-11 items-center gap-1.5 text-[15px] font-[650] text-steel hover:text-ink">
        <Icon name="back" className="size-[18px]" />
        {w.back}
      </Link>
      <PageTitle title={w.title} />
      <ActionForm action={createBooking} className="">
        <NewBookingFields
          words={w}
          language={language}
          locale={locale}
          defaultPetId={askedPet}
          pets={pets}
          search={findPets}
          facts={petFacts}
          healthWords={{ noneOnRecord: m.vaccinations.noneOnRecord, aVaccine: m.vaccinations.aVaccine, expiredBefore: m.vaccinations.expiredBefore, runsOutDuring: m.vaccinations.runsOutDuring }}
          reminder={{ none: parent.m.whatsapp.reminders.vaccinationNone, lapses: parent.m.whatsapp.reminders.vaccinationLapses, kennel: org.name, locale: parent.locale }}
          kennels={kennels.data}
          holds={holds.data.map((h) => ({ kennelId: h.kennel_id as string, clientId: h.client_id, kind: h.kind, startDate: h.start_date, endDate: h.end_date }))}
          defaultKind={pick(params.kind) === "daycare" ? "daycare" : "boarding"}
          defaultStart={start && isISODate(start) ? start : today}
          defaultEnd={end && isISODate(end) ? end : ""}
          defaultKennelId={kennel && kennels.data.some((k) => k.id === kennel) ? kennel : ""}
          sharedPrice={{ boarding: sharedPrice("boarding"), daycare: sharedPrice("daycare") }}
          usualPrice={{ boarding: boarding ?? null, daycare: daycare ?? null }}
          price={
            canManage
              ? { canSet: true, hint: usual ? fill(w.leaveEmpty, { usual }) : w.noUsualHint, symbol }
              : { canSet: false, text: `${usual ? fill(w.pricedAt, { usual }) : w.noUsual} ${w.onlyManagers}` }
          }
          notesLabel={w.notes}
          footer={
            <>
              <div className="flex flex-wrap items-center gap-2.5">
                <SubmitButton name="intent" value="confirmed" pendingLabel={w.booking}>
                  {w.confirm}
                </SubmitButton>
                <SubmitButton name="intent" value="requested" variant="secondary" pendingLabel={m.common.saving}>
                  {w.saveAsRequest}
                </SubmitButton>
                <SubmitButton name="intent" value="waitlist" variant="quiet" pendingLabel={m.common.saving}>
                  {w.addToWaitlist}
                </SubmitButton>
              </div>
              <p className="mt-2.5 text-sm text-slate">
                {w.requestNote} {w.waitlistNote}
              </p>
            </>
          }
        />
      </ActionForm>
    </>
  );
}
