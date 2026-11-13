import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Columns, DoorTag, Empty, Figure, Ledger, LedgerRow, Loading, Meter, Notice, PageTitle, Section, Select } from "@/components/ui";
import { Icon } from "@/components/icons";
import { requireOrg } from "@/lib/auth";
import { flagText, shortStayText } from "@/lib/bookings";
import { CARE_KINDS } from "@/lib/care";
import {
  addDays, dailySummaryMessage, EXPIRES_SOON_DAYS, formatDate, formatDay, formatMoney, formatWeekday, isOverstaying, leavingEarly, remindersToSend, sharedWith, spaceFreeMessage, todayIn,
  UNPAID_REMINDER_DAYS, VACCINATION_REMINDER_DAYS, CREDIT_REMINDER_DAYS, REVIEW_REMINDER_DAYS, zonedInstant, vaccinationWarnings, whatsappLink, portionReviewDue, trialsToFollowUp, localClock, localDate, type GroomCard,
} from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n, type I18n } from "@/lib/i18n-server";
import { appointmentsOn, workingPeople } from "@/lib/appointments";
import { lacksInWords, petsLacking } from "@/lib/health";
import { signedUrls } from "@/lib/media";
import { OnNow } from "@/components/on-now";
import { FlowersToSend, HouseJobs, SuppliesRunningOut, ToClean, TrialBadge, trialResults } from "@/components/today-day";
import { PetAvatar } from "@/components/pet-avatar";
import { FoldList } from "@/components/fold-list";
import { ReminderLink } from "@/components/reminder-link";
import { owedFor } from "@/lib/owed";
import { siteOrigin } from "@/lib/site";
import { bookingCards, familyHolds, type BookingCard } from "@/lib/queries";
import type { Tables } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";
import { checkIn, checkOut } from "./actions";
import { confirmRequest, extendToToday } from "./bookings/actions";

export const generateMetadata = () => appTitle((m) => m.today.title);

/** How many pets staying on are listed under In house on Today. */
const IN_HOUSE_SHOWN = 4;

export default function TodayPage({ searchParams }: PageProps<"/app">) {
  return (
    <Suspense fallback={<Loading />}>
      <Today searchParams={searchParams} />
    </Suspense>
  );
}

async function Today({ searchParams }: Pick<PageProps<"/app">, "searchParams">) {
  const query = await searchParams;
  const doneKey = query.done;
  // After a check-out, the next job is the bill.
  const billFor = doneKey === "checked_out" && typeof query.booking === "string" && /^[0-9a-f-]{36}$/.test(query.booking) ? query.booking : null;
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, language, locale } = t;
  // What to say after a step that moves a pet off its list (the form that was pressed goes with it).
  const done = typeof doneKey === "string" && doneKey in m.today.done ? m.today.done[doneKey as keyof typeof m.today.done] : null;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  // Make sure today's care tasks exist before counting them. Safe to repeat.
  const generated = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: today });
  if (generated.error) console.error("generate_care_tasks failed", generated.error.message);

  const [arrivalsRes, inHouseRes, kennelsRes, intakeRes, tasksRes, incidentsRes, upcomingRes, unpaidRes, origin, requestsRes, waitingRes] = await Promise.all([
    // Confirmed and due today or earlier: includes anyone who was expected yesterday and has not turned up.
    bookingCards(supabase, org.id).eq("status", "confirmed").lte("start_date", today).order("start_date"),
    bookingCards(supabase, org.id).eq("status", "checked_in").order("end_date"),
    supabase.from("kennels").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("is_active", true),
    supabase.from("intake_submissions").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "new"),
    supabase.from("care_tasks").select("kind, status").eq("org_id", org.id).eq("task_date", today).limit(10000),
    // Incidents still open that matter now: serious ones, and any the parent has not been told about.
    supabase
      .from("incidents")
      .select("id, severity, category, description, parent_notified_at, pets(id, name, clients(full_name, phone))")
      .eq("org_id", org.id)
      .is("resolved_at", null)
      .in("severity", ["medium", "high"])
      .order("occurred_at", { ascending: false })
      .limit(20),
    // For reminders: stays starting within a week, and the bills still owed that are old enough to remind about.
    // Owed first, as on the bills page: the oldest bills of a kennel that has issued hundreds are paid.
    bookingCards(supabase, org.id).eq("status", "confirmed").gt("start_date", today).lte("start_date", addDays(today, VACCINATION_REMINDER_DAYS)).order("start_date").limit(100),
    supabase
      .from("invoice_balances")
      .select("invoice_id")
      .eq("org_id", org.id)
      .eq("status", "issued")
      .gt("due_minor", 0)
      .lte("issued_on", addDays(today, -UNPAID_REMINDER_DAYS))
      .order("issued_on")
      .limit(200),
    siteOrigin(),
    // Stays parents asked for through their booking link, still waiting for an answer.
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "requested").eq("source", "parent").gte("end_date", today),
    // The waiting list (D42): which requests would fit now.
    supabase.rpc("waiting_list", { p_org: org.id }),
  ]);
  if (arrivalsRes.error || inHouseRes.error) throw new Error("Could not load today's bookings.");

  const arrivals = arrivalsRes.data;
  // Waiting requests a kennel is free for now, first in line first.
  const fitting = (waitingRes.data ?? []).filter((x) => x.has_space).map((x) => x.booking_id);
  const waitingCards = fitting.length > 0 ? ((await bookingCards(supabase, org.id).in("id", fitting.slice(0, 20))).data ?? []) : [];
  const freeForWaiting = fitting.flatMap((id) => waitingCards.filter((b) => b.id === id));
  const parentWords = parentI18n(org.parent_language, org.locale);
  const inHouse = inHouseRes.data;
  const photos = await signedUrls(supabase, [...arrivals, ...inHouse].map((b) => b.pets?.photo_path), { small: true });
  const incidents = (incidentsRes.data ?? []).filter((i) => i.severity === "high" || !i.parent_notified_at);
  // Vaccinations of the pets arriving, to warn before they come in.
  const vaccinations =
    arrivals.length > 0
      ? ((await supabase.from("vaccinations").select("pet_id, vaccine, valid_until").eq("org_id", org.id).in("pet_id", arrivals.map((b) => b.pets?.id ?? ""))).data ?? [])
      : [];
  const vaccineWarnings = new Map(
    arrivals.map((b) => [b.id, vaccinationWarnings(vaccinations.filter((v) => v.pet_id === b.pets?.id), { startDate: b.start_date, endDate: b.end_date })]),
  );
  const unpaid = (unpaidRes.data ?? []).flatMap((b) => (b.invoice_id ? [b.invoice_id] : []));
  const oldBills =
    unpaid.length > 0
      ? ((await supabase.from("invoices").select("id, number, issued_on, public_token, clients(full_name, phone)").eq("org_id", org.id).in("id", unpaid).order("issued_on")).data ?? [])
      : [];
  const reminders = await todaysReminders(supabase, org, today, origin, upcomingRes.data ?? [], inHouse, oldBills);
  // How each arriving pet settled on its trial day, if it had one (M56).
  const trials = await trialResults(supabase, org.id, arrivals.flatMap((b) => (b.pets ? [b.pets.id] : [])));
  const capacity = kennelsRes.count ?? 0;
  const newForms = intakeRes.count ?? 0;
  // Done out of what is owed: a task skipped on purpose is no longer owed.
  const care = CARE_KINDS.map((kind) => {
    const mine = (tasksRes.data ?? []).filter((t) => t.kind === kind && t.status !== "skipped");
    return { kind, done: mine.filter((t) => t.status === "done").length, total: mine.length };
  }).filter((c) => c.total > 0);

  // Kennels free for each arrival's whole stay, including one a sibling is in with room to share.
  const [freeKennels, siblingHolds] = await Promise.all([
    Promise.all(
      arrivals.map(async (b) => {
        const { data } = await supabase.rpc("available_kennels", { p_org: org.id, p_kind: b.kind, p_start: b.start_date, p_end: b.end_date, p_client: b.clients?.id });
        return (data ?? []).map((k) => ({ id: k.id, name: k.name }));
      }),
    ),
    arrivals.length > 0
      ? familyHolds(supabase, org.id, [...new Set(arrivals.flatMap((b) => (b.clients ? [b.clients.id] : [])))], today, addDays(today, 400))
      : Promise.resolve({ data: [] }),
  ]);
  const holds = (siblingHolds.data ?? []).map((h) => ({
    id: h.id, kennelId: h.kennel_id as string, clientId: h.client_id, kind: h.kind, startDate: h.start_date, endDate: h.end_date, petName: h.pets?.name ?? m.booking.pet,
  }));
  const kennelLabel = (b: BookingCard, k: { id: string; name: string }) => {
    const names = b.clients ? sharedWith({ id: b.id, clientId: b.clients.id, kind: b.kind, startDate: b.start_date, endDate: b.end_date }, holds).get(k.id) : undefined;
    return names ? fill(m.booking.kennelWith, { kennel: k.name, pets: names.join(", ") }) : k.name;
  };

  // Going home today (M67): due out today or past the check-out date, each with what its parent owes.
  const goingHome = inHouse.filter((b) => b.end_date <= today);
  const stayingIn = inHouse.filter((b) => b.end_date > today);
  // What each parent owes: asked once, and read by the pet's row and by the figure at the top. Neither holds Today up.
  const owed = new Map(goingHome.map((b) => [b.id, owedFor(supabase, org, b).catch(() => null)]));
  const noKennel = arrivals.filter((b) => !b.kennel_id).length;
  const careDone = care.reduce((sum, c) => sum + c.done, 0);
  const careTotal = care.reduce((sum, c) => sum + c.total, 0);
  const medicinesLeft = care.filter((c) => c.kind === "medication").reduce((sum, c) => sum + c.total - c.done, 0);
  const photoOf = (b: BookingCard) => (b.pets?.photo_path ? photos.get(b.pets.photo_path) : null);
  const petLink = (b: BookingCard) => (
    <Link href={`/app/bookings/${b.id}`} className="text-[16.5px] font-bold underline-offset-4 hover:underline">
      {b.pets?.name ?? m.today.unknownPet}
    </Link>
  );
  const checkOutButton = (b: BookingCard, grow: string) =>
    leavingEarly({ status: b.status, endDate: b.end_date }, today) ? (
      // Going home early: the booking page asks whether to bill to today or as booked (D40).
      <Link href={`/app/bookings/${b.id}`} className={buttonStyles.secondary}>
        {m.today.checkOutEarly}
      </Link>
    ) : (
      <ActionForm action={checkOut} className="contents">
        <input type="hidden" name="bookingId" value={b.id} />
        <input type="hidden" name="from" value="today" />
        <SubmitButton pendingLabel={m.today.checkingOut} variant="primary" className={grow}>
          {m.today.checkOut}
        </SubmitButton>
      </ActionForm>
    );
  const incidentLink = (b: BookingCard, show: string) =>
    b.pets ? (
      <Link href={`/app/dogs/${b.pets.id}/incident`} className={`${buttonStyles.quiet} ${show}`}>
        {m.today.incident}
      </Link>
    ) : null;

  const goingHomeRow = (b: BookingCard) => (
    <LedgerRow key={b.id}>
      <span className="hidden lg:block">
        <PetAvatar name={b.pets?.name ?? "?"} url={photoOf(b)} />
      </span>
      <div className="min-w-0 flex-[1_1_240px]">
        <p className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
          <DoorTag name={b.kennels?.name} empty={m.common.noKennel} />
          {petLink(b)}
          {b.pets?.breed ? <span className="hidden text-sm text-slate lg:inline">{b.pets.breed}</span> : null}
          {b.clients ? <span className="text-sm text-slate lg:hidden">· {b.clients.full_name}</span> : null}
          <StayBadges t={t} booking={b} today={today} />
        </p>
        <p className="mt-0.5 text-sm text-slate max-sm:mt-2 max-sm:text-[14.5px]">
          {b.clients ? <span className="hidden lg:inline">{b.clients.full_name} · </span> : null}
          <Suspense fallback={null}>
            <OwedAtCheckOut t={t} booking={b} found={owed.get(b.id)} />
          </Suspense>
        </p>
      </div>
      <div className="flex flex-wrap gap-2 max-sm:w-full">
        {isOverstaying({ status: b.status, endDate: b.end_date }, today) ? (
          <ActionForm action={extendToToday} className="contents">
            <input type="hidden" name="bookingId" value={b.id} />
            <input type="hidden" name="from" value="today" />
            <SubmitButton variant="secondary" pendingLabel={m.today.extending} className="max-sm:w-full">
              {m.today.extend}
            </SubmitButton>
          </ActionForm>
        ) : null}
        <Link href={`/app/bookings/${b.id}/update`} className={`${buttonStyles.quiet} max-sm:flex-1 max-sm:bg-ground`}>
          {m.today.writeUpdate}
        </Link>
        {incidentLink(b, "max-lg:hidden")}
        {checkOutButton(b, "max-sm:flex-1")}
      </div>
    </LedgerRow>
  );

  const stayingRow = (b: BookingCard) => (
    <LedgerRow key={b.id}>
      <DoorTag name={b.kennels?.name} empty={m.common.noKennel} />
      <p className="min-w-0 flex-[1_1_200px]">
        <Link href={`/app/bookings/${b.id}`} className="font-bold underline-offset-4 hover:underline">
          {b.pets?.name ?? m.today.unknownPet}
        </Link>{" "}
        <span className="text-sm text-slate">
          {b.clients ? `· ${b.clients.full_name} ` : ""}· {fill(m.today.until, { date: formatDay(b.end_date, locale) })}
        </span>
      </p>
      <span className="flex flex-wrap gap-1.5">
        {b.end_date === addDays(today, 1) ? <Badge>{m.today.leavesTomorrow}</Badge> : null}
        <StayBadges t={t} booking={b} today={today} />
      </span>
      <div className="flex flex-wrap gap-1 max-sm:w-full">
        <Link href={`/app/bookings/${b.id}/update`} className={`${buttonStyles.quiet} max-sm:flex-1 max-sm:bg-ground`}>
          {m.today.writeUpdate}
        </Link>
        {incidentLink(b, "max-sm:hidden")}
        {checkOutButton(b, "")}
      </div>
    </LedgerRow>
  );

  // A notice with its icon, and its link kept at the right.
  const waiting = (icon: "form" | "bookings", text: string, href: string, link: string) => (
    <Link href={href} className="mb-2.5 flex items-center gap-3 rounded-[14px] bg-marigold-soft px-4 py-3.5 text-[#3d2a00] max-sm:text-[15px]">
      <Icon name={icon} className="size-5 max-sm:hidden" />
      <span className="flex-1">{text}</span>
      <strong className="underline underline-offset-4">{link}</strong>
    </Link>
  );
  const notices =
    newForms > 0 || (requestsRes.count ?? 0) > 0 ? (
      <div className="mb-(--wb-gap) flex flex-col [&>a:last-child]:mb-0">
        {newForms > 0 ? waiting("form", plural(language, newForms, m.today.newForms), "/app/more/intake", m.today.review) : null}
        {(requestsRes.count ?? 0) > 0 ? waiting("bookings", plural(language, requestsRes.count ?? 0, m.today.parentRequests), "/app/bookings", m.today.seeRequests) : null}
      </div>
    ) : null;

  // On a phone the kinds of care are chips in a row: medicines first, and what is finished last.
  const wide = (long: string, short: string) => (
    <>
      <span className="hidden lg:inline">{long}</span>
      <span className="lg:hidden">{short}</span>
    </>
  );
  const careChips = [...care].sort((a, b) => Number(a.done === a.total) - Number(b.done === b.total) || Number(b.kind === "medication") - Number(a.kind === "medication"));

  return (
    <>
      <PageTitle eyebrow={m.today.title} title={formatWeekday(today, locale)}>
        <form action="/app/bookings" role="search" className="hidden h-12 min-w-[260px] items-center gap-2 rounded-[10px] border border-rule-strong bg-paper px-3.5 text-slate focus-within:border-ink lg:flex">
          <Icon name="search" />
          <label htmlFor="today-search" className="sr-only">
            {m.bookings.searchLabel}
          </label>
          <input id="today-search" name="q" type="search" placeholder={m.bookings.searchPlaceholder} className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-slate" />
        </form>
        <Link href="/app/bookings/new" className={`${buttonStyles.primary} max-sm:hidden`}>
          <Icon name="plus" />
          {m.today.newBooking}
        </Link>
      </PageTitle>

      {done ? (
        <Notice tone="ok">
          {done}
          {billFor ? (
            <>
              {" "}
              <Link href={`/app/bookings/${billFor}`} className="underline underline-offset-4">
                {m.today.makeBill}
              </Link>
            </>
          ) : null}
        </Notice>
      ) : null}

      {/* The day in four numbers (D59). */}
      <div className="mb-(--wb-gap) grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:gap-3.5">
        <Figure
          label={m.today.inHouseTitle}
          hint={capacity > 0 ? <Meter value={inHouse.length} total={capacity} tone="leaf" label={fill(m.today.inHouseOf, { inHouse: inHouse.length, capacity })} /> : undefined}
        >
          {inHouse.length}
          {capacity > 0 ? (
            <span className="ml-1 text-sm font-[650] tracking-normal text-slate lg:text-base">{wide(fill(m.today.ofKennels, { capacity }), fill(m.today.short.of, { capacity }))}</span>
          ) : null}
        </Figure>
        <Figure label={m.today.toArriveTitle} tone="attention" hint={noKennel > 0 ? wide(plural(language, noKennel, m.today.noKennelCount), fill(m.today.short.noKennel, { n: noKennel })) : undefined}>
          {arrivals.length}
        </Figure>
        <Figure
          label={m.today.goingHomeShort}
          hint={
            goingHome.length > 0 ? (
              <Suspense fallback={null}>
                <ToCollect t={t} owed={[...owed.values()]} />
              </Suspense>
            ) : undefined
          }
        >
          {goingHome.length}
        </Figure>
        <Figure label={wide(m.today.careLeft, m.today.short.careLeft)} tone="alert" hint={medicinesLeft > 0 ? plural(language, medicinesLeft, m.today.medicinesDue) : undefined}>
          {careTotal - careDone}
        </Figure>
      </div>

      {org.keeps_rota ? (
        <Suspense fallback={null}>
          <OnNow />
        </Suspense>
      ) : null}

      {capacity === 0 ? (
        <p className="mb-(--wb-gap) rounded-[14px] bg-marigold-soft px-4 py-3.5">
          {m.today.noKennels}{" "}
          <Link href="/app/more/kennels" className="font-semibold underline underline-offset-4">
            {m.today.addKennels}
          </Link>
        </p>
      ) : null}

      {care.length > 0 ? (
        <>
          {/* Phone: chips to swipe along. */}
          <div className="-mx-4 mb-(--wb-gap) flex gap-2 overflow-x-auto px-4 sm:hidden">
            {careChips.map((c) => {
              const finished = c.done === c.total;
              const medicine = c.kind === "medication" && !finished;
              return (
                <Link
                  key={c.kind}
                  href={`/app/care?kind=${c.kind}&show=pending`}
                  className={`inline-flex min-h-11 items-center whitespace-nowrap rounded-full px-3.5 text-sm font-bold ${
                    finished ? "bg-leaf-soft text-leaf-ink" : medicine ? "bg-alert-soft text-alert-ink" : "border border-rule bg-paper text-ink"
                  }`}
                >
                  {finished
                    ? fill(m.today.kindDone, { kind: m.labels.careKindPlural[c.kind] })
                    : fill(m.today.careCount, { kind: m.labels.careKindPlural[c.kind], done: c.done, total: c.total })}
                </Link>
              );
            })}
          </div>
          {/* Tablet: a tile for each kind. Laptop: the tiles in a card, with the whole round counted. */}
          <section aria-labelledby="care-round" className="mb-(--wb-gap) hidden sm:block lg:rounded-2xl lg:border lg:border-rule lg:bg-paper lg:px-5 lg:pb-5 lg:pt-[18px]">
            <div className="mb-3.5 hidden flex-wrap items-center gap-2.5 lg:flex">
              <h2 id="care-round" className="text-lg font-[750]">
                {m.today.careRound}
              </h2>
              <span className="text-sm text-slate">{fill(m.today.careDone, { done: careDone, total: careTotal })}</span>
              <Link href="/app/care" className={`${buttonStyles.quiet} -my-2 ml-auto`}>
                {m.today.openCare}
              </Link>
            </div>
            <div className="grid gap-2 lg:gap-3" style={{ gridTemplateColumns: `repeat(${Math.max(4, Math.min(care.length, 6))}, minmax(0, 1fr))` }}>
              {care.map((c) => {
                const finished = c.done === c.total;
                const medicine = c.kind === "medication" && !finished;
                return (
                  <Link
                    key={c.kind}
                    href={`/app/care?kind=${c.kind}&show=pending`}
                    className={`flex flex-col gap-1.5 rounded-xl p-3 lg:gap-2 lg:p-3.5 ${
                      finished
                        ? "bg-leaf-soft text-leaf-ink [--wb-track:#c3e5cf]"
                        : medicine
                          ? "bg-alert-soft text-alert-ink [--wb-track:#f5cbc7]"
                          : "border border-rule bg-paper text-ink lg:border-transparent lg:bg-wash"
                    }`}
                  >
                    <span className="flex justify-between gap-2 text-[14.5px] font-bold lg:text-base">
                      <span className="inline-flex items-center gap-1.5">
                        {finished ? <Icon name="check" className="size-[18px]" /> : null}
                        {m.labels.careKindPlural[c.kind]}
                      </span>
                      <span>{wide(fill(m.today.doneOf, { done: c.done, total: c.total }), fill(m.today.short.doneOf, { done: c.done, total: c.total }))}</span>
                    </span>
                    <Meter value={c.done} total={c.total} tone={medicine ? "alert" : "ink"} />
                  </Link>
                );
              })}
            </div>
          </section>
        </>
      ) : null}

      <Columns
        from="wide"
        main={
          <>
            {incidents.length > 0 ? (
              <section aria-labelledby="incidents" className="mb-(--wb-gap) rounded-2xl border-2 border-alert bg-alert-soft px-4 py-3.5 lg:px-5 lg:py-4">
                <h2 id="incidents" className="text-[15px] font-bold text-alert-ink">
                  {m.today.incidents}
                </h2>
                <ul className="divide-y divide-alert/20">
                  {incidents.map((i) => (
                    <li key={i.id} className="flex flex-wrap items-start gap-x-3.5 gap-y-2.5 py-2.5 first:pt-1 last:pb-0">
                      <span className="hidden size-10 shrink-0 items-center justify-center rounded-xl bg-alert text-paper lg:inline-flex">
                        <Icon name="warning" />
                      </span>
                      <div className="min-w-0 flex-[1_1_280px]">
                        <p className="flex flex-wrap items-center gap-2">
                          <strong className="text-[16.5px] lg:text-[17px]">{i.pets?.name}</strong>
                          <span className="inline-flex min-h-6 items-center rounded-full bg-paper px-[9px] text-[12.5px] font-[650] text-alert-ink">{m.labels.severityShort[i.severity]}</span>
                          {i.parent_notified_at ? null : <Badge tone="attention">{m.today.parentNotTold}</Badge>}
                        </p>
                        <p className="mt-1 line-clamp-2 max-sm:text-[15px]">{i.description}</p>
                      </div>
                      <div className="flex flex-wrap gap-2 max-sm:w-full">
                        {!i.parent_notified_at && i.pets?.clients?.phone ? (
                          <a href={whatsappLink(fill(parentWords.m.whatsapp.incident, { parent: (i.pets.clients.full_name ?? "").split(" ")[0], kennel: org.name, pet: i.pets.name }), i.pets.clients.phone)} target="_blank" rel="noreferrer" className={`${buttonStyles.whatsapp} max-sm:flex-1`}>
                            {m.today.tellParent}
                          </a>
                        ) : null}
                        <Link href={`/app/dogs/${i.pets?.id}`} className={buttonStyles.secondary}>
                          {m.today.open}
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            ) : null}

            {/* Beside the lists on a laptop; above them on a tablet and a phone. */}
            <div className="min-[1200px]:hidden">{notices}</div>

            <Section title={m.today.arriving} count={arrivals.length}>
              {arrivals.length === 0 ? (
                <Empty>{m.today.nobodyArriving}</Empty>
              ) : (
                <FoldList limit={3} count={arrivals.length} more={fill(m.today.seeMore, { n: arrivals.length - 3 })}>
                  {arrivals.map((b, i) => {
                    const vaccineWarning = (vaccineWarnings.get(b.id) ?? []).length > 0;
                    const trial = b.pets ? trials.get(b.pets.id)?.outcome : undefined;
                    return (
                      <LedgerRow key={b.id}>
                        <PetAvatar name={b.pets?.name ?? "?"} url={photoOf(b)} />
                        <div className="min-w-0 flex-[1_1_180px] lg:flex-[1_1_240px]">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            {petLink(b)}
                            {b.pets?.breed ? <span className="text-sm text-slate">{b.pets.breed}</span> : null}
                            {trial ? <TrialBadge t={t} outcome={trial} /> : null}
                            {vaccineWarning ? (
                              <span className="max-sm:hidden">
                                <Badge tone="attention">{m.today.checkVaccinations}</Badge>
                              </span>
                            ) : null}
                            <StayBadges t={t} booking={b} today={today} />
                          </p>
                          <p className="text-sm text-slate">
                            {b.clients ? `${b.clients.full_name} · ` : ""}
                            {shortStayText(t, b.kind, b.start_date, b.end_date, today)}
                          </p>
                        </div>
                        {vaccineWarning ? (
                          <span className="flex min-h-[30px] w-full items-center rounded-lg bg-marigold-soft px-[9px] text-[12.5px] font-[650] text-marigold-ink sm:hidden">{m.today.checkVaccinations}</span>
                        ) : null}
                        <ActionForm action={checkIn} className="flex flex-wrap items-center gap-2 max-sm:w-full">
                          <input type="hidden" name="bookingId" value={b.id} />
                          <input type="hidden" name="from" value="today" />
                          <label className="max-sm:flex-1">
                            <span className="sr-only">{fill(m.today.kennelFor, { pet: b.pets?.name ?? "" })}</span>
                            <Select name="kennelId" defaultValue={b.kennel_id ?? ""} className="px-3! sm:w-[150px] lg:w-auto lg:min-w-[170px]">
                              <option value="">{m.today.noKennelYet}</option>
                              {b.kennels ? <option value={b.kennels.id}>{kennelLabel(b, b.kennels)}</option> : null}
                              {freeKennels[i]
                                .filter((k) => k.id !== b.kennel_id)
                                .map((k) => (
                                  <option key={k.id} value={k.id}>
                                    {kennelLabel(b, k)}
                                  </option>
                                ))}
                            </Select>
                          </label>
                          <SubmitButton pendingLabel={m.today.checkingIn} className="max-sm:flex-1">
                            {m.today.checkIn}
                          </SubmitButton>
                        </ActionForm>
                      </LedgerRow>
                    );
                  })}
                </FoldList>
              )}
            </Section>

            {goingHome.length > 0 ? (
              <Section title={m.today.goingHome} count={goingHome.length}>
                <FoldList limit={2} count={goingHome.length} more={fill(m.today.seeMore, { n: goingHome.length - 2 })}>
                  {goingHome.map(goingHomeRow)}
                </FoldList>
              </Section>
            ) : null}

            {inHouse.length === 0 ? (
              <Section title={m.today.inHouseTitle} count={0}>
                <Empty>{m.today.noneInHouse}</Empty>
              </Section>
            ) : stayingIn.length > 0 ? (
              <Section
                title={m.today.inHouseTitle}
                count={stayingIn.length}
                action={
                  <Link href="/app/bookings" className={buttonStyles.quiet}>
                    {fill(m.today.seeAll, { n: stayingIn.length })}
                  </Link>
                }
              >
                {/* The pets leaving soonest; the rest are on Bookings, behind See all. */}
                <Ledger>{stayingIn.slice(0, IN_HOUSE_SHOWN).map(stayingRow)}</Ledger>
              </Section>
            ) : null}
          </>
        }
        side={
          <>
            <div className="max-[1199px]:hidden">{notices}</div>

            {freeForWaiting.length > 0 ? (
              <Section title={m.today.waitlist.title} count={freeForWaiting.length}>
                <p className="mb-3 text-sm text-slate">{m.today.waitlist.about}</p>
                <Ledger>
                  {freeForWaiting.map((b) => (
                    <LedgerRow key={b.id}>
                      <div className="min-w-0 flex-[1_1_160px]">
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          {petLink(b)}
                          {b.pets?.breed ? <span className="text-sm text-slate">{b.pets.breed}</span> : null}
                        </p>
                        <p className="text-sm text-slate">
                          {b.clients ? `${b.clients.full_name} · ` : ""}
                          {shortStayText(t, b.kind, b.start_date, b.end_date, today)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2 max-sm:w-full">
                        {b.clients ? (
                          <a
                            href={whatsappLink(
                              spaceFreeMessage(
                                parentWords.m.whatsapp,
                                { kennelName: org.name, parentName: b.clients.full_name, petName: b.pets?.name ?? parentWords.m.whatsapp.yourPet, startDate: b.start_date, endDate: b.end_date },
                                parentWords.locale,
                              ),
                              b.clients.phone,
                            )}
                            target="_blank"
                            rel="noreferrer"
                            className={buttonStyles.whatsapp}
                          >
                            {m.today.waitlist.tell}
                          </a>
                        ) : null}
                        <ActionForm action={confirmRequest} className="contents">
                          <input type="hidden" name="bookingId" value={b.id} />
                          <SubmitButton variant="secondary" pendingLabel={m.booking.step.confirming}>
                            {m.booking.step.confirm}
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </LedgerRow>
                  ))}
                </Ledger>
              </Section>
            ) : null}

            {/* On a tablet the short lists sit two to a row. */}
            <div className="sm:max-[1199px]:grid sm:max-[1199px]:grid-cols-2 sm:max-[1199px]:items-start sm:max-[1199px]:gap-x-[18px]">
              {reminders.length > 0 ? (
                <Section title={m.today.toSend} count={reminders.length}>
                  <p className="mb-3 text-sm text-slate">{m.today.toSendHint}</p>
                  <Ledger>
                    {reminders.slice(0, 20).map((r) => (
                      <LedgerRow key={`${r.kind}-${r.subjectId}`}>
                        <div className="min-w-0 flex-[1_1_160px]">
                          <p className="text-sm font-[650] text-slate">{m.today.reminderKinds[r.kind]}</p>
                          <p className="font-[650]">
                            {r.kind === "unpaid" || r.kind === "credit" ? `${r.parentName}, ${r.about}` : fill(m.today.forPet, { parent: r.parentName, pet: r.about })}
                          </p>
                        </div>
                        <ReminderLink href={whatsappLink(r.text, r.phone)} kind={r.kind} subjectId={r.subjectId} label={m.today.send} title={fill(m.today.sendTo, { name: r.parentName })} words={sentWords(t)} />
                      </LedgerRow>
                    ))}
                  </Ledger>
                </Section>
              ) : null}

              <Suspense fallback={null}>
                <ToClean t={t} />
              </Suspense>
              <Suspense fallback={null}>
                <HouseJobs t={t} today={today} lists={["opening", "closing"]} />
              </Suspense>
              <Suspense fallback={null}>
                <FlowersToSend t={t} />
              </Suspense>
              <Suspense fallback={null}>
                <SuppliesRunningOut t={t} />
              </Suspense>

              {org.offers_appointments ? (
                <Suspense fallback={null}>
                  <AppointmentsToday t={t} today={today} />
                </Suspense>
              ) : null}

              {org.offers_kitchen ? (
                <Suspense fallback={null}>
                  <KitchenToday t={t} today={today} />
                </Suspense>
              ) : null}
            </div>

            {canManage ? (
              <Suspense fallback={null}>
                <TomorrowSummary t={t} today={today} />
              </Suspense>
            ) : null}
          </>
        }
      />
    </>
  );
}

/** What is still to collect from the pets going home today, under the figure: bills owed and what unbilled stays come to. */
async function ToCollect({ t, owed }: { t: I18n; owed: Promise<Owed | null>[] }) {
  const { org } = await requireOrg();
  const found = await Promise.all(owed);
  // A family's bill is found once for each of its pets: count it once.
  const seen = new Set<string>();
  let total = 0;
  for (const f of found) {
    if (!f || !("amountMinor" in f.owed)) continue;
    if (f.invoiceId) {
      if (seen.has(f.invoiceId)) continue;
      seen.add(f.invoiceId);
    }
    total += f.owed.amountMinor;
  }
  if (total <= 0) return null;
  const amount = formatMoney(total, { currency: org.currency, locale: t.locale, trimZeros: true });
  return (
    <>
      <span className="hidden lg:inline">{fill(t.m.today.toCollect, { amount })}</span>
      <span className="lg:hidden">{fill(t.m.today.short.toCollect, { amount })}</span>
    </>
  );
}

type Owed = NonNullable<Awaited<ReturnType<typeof owedFor>>>;

/**
 * What the parent owes, on a pet going home today (M67): from its bill, or
 * what the stay comes to now less what was paid ahead. Loaded on its own, so
 * Today is not held up; it links to the bill when there is one.
 */
async function OwedAtCheckOut({ t, booking, found: asked }: { t: I18n; booking: BookingCard; found?: Promise<Owed | null> }) {
  const { org } = await requireOrg();
  const { m, locale } = t;
  const found = await asked;
  if (!found) return null;
  const { owed, invoiceId, family } = found;
  const w = m.today.owed;
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const sentence =
    owed.kind === "due"
      ? fill(w.due, { amount: money(owed.amountMinor), number: owed.number })
      : owed.kind === "paid"
        ? fill(w.paid, { number: owed.number })
        : owed.kind === "monthly"
          ? w.monthly
          : owed.kind === "covered"
            ? w.covered
            : [fill(owed.kind === "draft" ? w.draft : w.estimate, { amount: money(owed.amountMinor) }), owed.advanceMinor > 0 ? fill(w.afterAdvance, { advance: money(owed.advanceMinor) }) : ""]
                .filter(Boolean)
                .join(" ");
  const text = family && owed.kind !== "monthly" ? `${sentence} ${w.family}` : sentence;
  // Owed on a bill stands out; a bill that is paid is green; an estimate is said plainly.
  const tone = owed.kind === "due" ? "font-bold text-marigold-ink" : owed.kind === "paid" ? "font-bold text-leaf-ink" : "";
  return (
    <Link href={invoiceId ? `/app/bills/${invoiceId}` : `/app/bookings/${booking.id}`} className={`underline-offset-4 hover:underline ${tone}`}>
      {text}
    </Link>
  );
}

/** The day's appointments on Today (M34), while the kennel offers appointments. */
async function AppointmentsToday({ t, today }: { t: I18n; today: string }) {
  const { org } = await requireOrg();
  const { m } = t;
  const w = m.appointments;
  const supabase = await createClient();
  const [list, places, people, asked] = await Promise.all([
    appointmentsOn(supabase, org.id, org.time_zone, today),
    supabase.from("appointment_places").select("id, name").eq("org_id", org.id),
    workingPeople(supabase, org.id),
    // Asked for by parents from their own link (M59), still waiting.
    supabase.from("appointments").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("source", "parent").eq("status", "requested").gte("starts_at", new Date().toISOString()),
  ]);
  if (list.error) throw new Error("Could not load today's appointments.");
  return (
    <Section title={w.today} count={list.data.length}>
      {(asked.count ?? 0) > 0 ? (
        <p className="mb-3 rounded-lg bg-marigold-soft px-4 py-3">
          {plural(t.language, asked.count ?? 0, w.parentAsked)}{" "}
          <Link href="/app/appointments" className="font-semibold underline underline-offset-4">
            {m.today.seeRequests}
          </Link>
        </p>
      ) : null}
      {list.data.length === 0 ? (
        <Empty>{w.todayEmpty}</Empty>
      ) : (
        <Ledger>
          {list.data.map((a) => {
            const person = people.data?.find((p) => p.user_id === a.staff_id)?.display_name;
            return (
              <li key={a.id}>
                <Link href={`/app/appointments/${a.id}`} className="flex min-h-12 flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-ground">
                  <span className="font-bold tabular-nums">{localClock(a.starts_at, org.time_zone)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="font-bold">{a.pets?.name}</span> {a.appointment_services?.name}
                    <span className="block text-sm text-slate">
                      {[places.data?.find((p) => p.id === a.place_id)?.name, person ? fill(w.with, { person }) : null].filter(Boolean).join(", ")}
                    </span>
                  </span>
                  <Badge tone={a.status === "requested" ? "attention" : a.status === "done" ? "good" : "neutral"}>{m.appointmentStatus[a.status]}</Badge>
                </Link>
              </li>
            );
          })}
        </Ledger>
      )}
      <Link href={`/app/appointments?date=${localDate(new Date(), org.time_zone)}`} className={`${buttonStyles.quiet} mt-2`}>
        {w.seeDay}
      </Link>
    </Section>
  );
}

/**
 * The kitchen and food on Today (M29, M30), while the kennel has a kitchen:
 * what to cook tomorrow, today's packing, orders waiting, portions to look at
 * a week after a pet starts, and parents to ask about a subscription a few
 * days after their dog's trial.
 */
async function KitchenToday({ t, today }: { t: I18n; today: string }) {
  const { org } = await requireOrg();
  const { m, locale } = t;
  const w = m.todayKitchen;
  const supabase = await createClient();
  const [packing, orders, food, trials, problems] = await Promise.all([
    supabase.from("deliveries").select("status").eq("org_id", org.id).eq("delivery_date", today).neq("status", "cancelled"),
    supabase.from("food_orders").select("id", { count: "exact", head: true }).eq("org_id", org.id).in("status", ["paid", "requested"]),
    supabase.from("pet_food").select("pet_id, started_on, reviewed_on, pets(name)").eq("org_id", org.id).not("started_on", "is", null),
    supabase
      .from("deliveries")
      .select("id, delivery_date, status, client_id, pets(name, passed_away_on), clients(full_name, phone)")
      .eq("org_id", org.id)
      .eq("kind", "trial")
      .eq("status", "delivered")
      .gte("delivery_date", addDays(today, -14)),
    // Delivery problems not dealt with yet, many told by parents from their link (M59).
    supabase.from("delivery_problems").select("id", { count: "exact", head: true }).eq("org_id", org.id).is("outcome", null),
  ]);
  if (packing.error || food.error || trials.error) return null;
  // Asked already, or subscribed already: read only for these trials, so a
  // kennel with more than 1,000 reminders or subscriptions is not cut short.
  const trialIds = trials.data.map((d) => d.id);
  const trialClients = [...new Set(trials.data.map((d) => d.client_id))];
  const [asked, subs] = await Promise.all([
    trialIds.length > 0 ? supabase.from("reminders_sent").select("subject_id").eq("org_id", org.id).eq("kind", "trial").in("subject_id", trialIds) : Promise.resolve({ data: [] }),
    trialClients.length > 0 ? supabase.from("subscriptions").select("client_id").eq("org_id", org.id).in("client_id", trialClients) : Promise.resolve({ data: [] }),
  ]);
  const packed = packing.data.filter((d) => d.status !== "planned").length;
  const review = food.data.filter((f) => portionReviewDue(f, today));
  const askedAbout = new Set((asked.data ?? []).map((r) => r.subject_id));
  const follow = trialsToFollowUp(
    trials.data.filter((d) => !askedAbout.has(d.id) && !d.pets?.passed_away_on),
    new Set((subs.data ?? []).map((s) => s.client_id)),
    new Set(),
    today,
  );
  const p = parentI18n(org.parent_language, org.locale);

  return (
    <Section title={w.title}>
      <div className="space-y-3">
        <p className="flex flex-wrap gap-2">
          <Link href={`/app/kitchen?date=${addDays(today, 1)}`} className={buttonStyles.secondary}>
            {w.cook}
          </Link>
          {packing.data.length > 0 ? (
            <Link href={`/app/kitchen?date=${today}`} className={buttonStyles.quiet}>
              {fill(w.packing, { packed, total: packing.data.length })}
            </Link>
          ) : null}
          {(orders.count ?? 0) > 0 ? (
            <Link href="/app/food/orders" className={buttonStyles.quiet}>
              {fill(w.orders, { count: orders.count ?? 0 })}
            </Link>
          ) : null}
          {(problems.count ?? 0) > 0 ? (
            <Link href="/app/food" className={buttonStyles.quiet}>
              {fill(w.problems, { count: problems.count ?? 0 })}
            </Link>
          ) : null}
        </p>
        {review.length > 0 ? (
          <div>
            <p className="mb-1 font-bold">{w.review}</p>
            <Ledger>
              {review.map((f) => (
                <li key={f.pet_id}>
                  <Link href={`/app/dogs/${f.pet_id}`} className="flex min-h-12 items-center px-4 py-3 hover:bg-ground">
                    {fill(w.reviewLine, { pet: f.pets?.name ?? "", date: formatDate(f.started_on!, locale) })}
                  </Link>
                </li>
              ))}
            </Ledger>
          </div>
        ) : null}
        {follow.length > 0 ? (
          <div>
            <p className="mb-1 font-bold">{w.trials}</p>
            <Ledger>
              {follow.map((d) => (
                <LedgerRow key={d.id}>
                  <span className="min-w-0 flex-1">{fill(w.trialLine, { pet: d.pets?.name ?? "", parent: d.clients?.full_name ?? "", date: formatDate(d.delivery_date, locale) })}</span>
                  <ReminderLink
                    href={whatsappLink(
                      fill(p.m.todayKitchen.trialMessage, { name: (d.clients?.full_name ?? "").split(" ")[0], pet: d.pets?.name ?? "", kennel: org.name }),
                      d.clients?.phone,
                    )}
                    kind="trial"
                    subjectId={d.id}
                    label={w.ask}
                    title={w.ask}
                    words={sentWords(t)}
                  />
                </LedgerRow>
              ))}
            </Ledger>
          </div>
        ) : null}
      </div>
    </Section>
  );
}

/** For owners and managers: tomorrow on one WhatsApp message, to send to themselves. */
async function TomorrowSummary({ t, today }: { t: I18n; today: string }) {
  const { org, user } = await requireOrg();
  const supabase = await createClient();
  const tomorrow = addDays(today, 1);
  const [arriving, leaving, staying, me] = await Promise.all([
    supabase.from("bookings").select("pets(name), kennels(name)").eq("org_id", org.id).eq("status", "confirmed").eq("start_date", tomorrow).order("created_at"),
    supabase.from("bookings").select("pets(name), kennels(name)").eq("org_id", org.id).in("status", ["confirmed", "checked_in"]).eq("kind", "boarding").eq("end_date", tomorrow).order("created_at"),
    // Pets in house, or arriving tomorrow: their vaccinations matter now.
    supabase.from("bookings").select("pet_id").eq("org_id", org.id).or(`status.eq.checked_in,and(status.eq.confirmed,start_date.eq.${tomorrow})`),
    supabase.from("memberships").select("phone").eq("org_id", org.id).eq("user_id", user.id).maybeSingle(),
  ]);
  if (arriving.error || leaving.error || staying.error) return null;
  const petIds = [...new Set(staying.data.map((b) => b.pet_id))];
  const vaccines = petIds.length
    ? ((
        await supabase
          .from("vaccinations")
          .select("vaccine, valid_until, pets(name)")
          .eq("org_id", org.id)
          .in("pet_id", petIds)
          .not("valid_until", "is", null)
          .lte("valid_until", addDays(tomorrow, EXPIRES_SOON_DAYS))
          .order("valid_until")
      ).data ?? [])
    : [];
  const text = dailySummaryMessage(
    t.m.summary,
    {
      kennelName: org.name,
      date: tomorrow,
      arrivals: arriving.data.map((b) => ({ pet: b.pets?.name ?? "", kennel: b.kennels?.name })),
      departures: leaving.data.map((b) => ({ pet: b.pets?.name ?? "", kennel: b.kennels?.name })),
      vaccinations: vaccines.map((v) => ({ pet: v.pets?.name ?? "", vaccine: v.vaccine, validUntil: v.valid_until as string })),
    },
    t.locale,
  );
  return (
    <div className="mb-7">
      <a href={whatsappLink(text, me.data?.phone)} target="_blank" rel="noreferrer" className={buttonStyles.whatsapp}>
        {t.m.summary.button}
      </a>
      <p className="mt-1 text-sm text-slate">{t.m.summary.hint}</p>
    </div>
  );
}

/** What to know about a stay at a glance, as badges after the pet's name. */
function StayBadges({ t, booking: b, today }: { t: I18n; booking: BookingCard; today: string }) {
  const { m, locale } = t;
  const overdue = b.status === "checked_in" && b.end_date < today;
  const late = b.status === "confirmed" && b.start_date < today;
  return (
    <>
      {b.kind === "daycare" ? <Badge>{m.labels.bookingKind.daycare}</Badge> : null}
      {b.is_trial ? <Badge tone="attention">{m.trial.badge}</Badge> : null}
      {overdue ? <Badge tone="attention">{fill(m.today.wasDueToLeave, { date: formatDay(b.end_date, locale) })}</Badge> : null}
      {late ? <Badge tone="attention">{fill(m.today.wasDue, { date: formatDay(b.start_date, locale) })}</Badge> : null}
      {(b.pets?.flags ?? []).map((f) => (
        <Badge key={f} tone="alert">
          {flagText(m, f)}
        </Badge>
      ))}
    </>
  );
}

/**
 * The reminders due today (src/lib/core/reminders.ts), in the language the
 * kennel uses for parents: vaccination cards, health papers (M40), see you
 * tomorrow, going home tomorrow, unpaid bills, pets due a groom again (M35),
 * credit ending (M38) and asking for a review (M42).
 */
async function todaysReminders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  org: Pick<
    Tables<"organizations">,
    | "id" | "name" | "parent_language" | "locale" | "currency" | "check_in_time" | "check_out_time" | "time_zone" | "offers_appointments"
    | "health_check" | "deworm_days" | "tick_days" | "neuter_months" | "review_url"
  >,
  today: string,
  origin: string,
  upcoming: BookingCard[],
  inHouse: BookingCard[],
  oldBills: { id: string; number: string | null; issued_on: string | null; public_token: string; clients: { full_name: string; phone: string } | null }[],
) {
  const weekAgo = addDays(today, -REVIEW_REMINDER_DAYS);
  const [grooms, lacking, credits, endedStays, endedVisits] = await Promise.all([
    org.offers_appointments ? groomCards(supabase, org) : Promise.resolve([]),
    petsLacking(supabase, org, upcoming.flatMap((b) => (b.pets ? [{ petId: b.pets.id, on: b.start_date }] : []))),
    supabase
      .from("credit_balances")
      .select("credit_id, client_id, left_minor, expires_on")
      .eq("org_id", org.id)
      .gt("left_minor", 0)
      .gte("expires_on", today)
      .lte("expires_on", addDays(today, CREDIT_REMINDER_DAYS))
      .limit(100),
    // Reviews: stays that ended in the last week (not each day of a daycare series), and visits for an appointment alone.
    org.review_url
      ? bookingCards(supabase, org.id).eq("status", "checked_out").is("series_id", null).gte("end_date", weekAgo).lte("end_date", today).limit(100)
      : Promise.resolve({ data: [] as BookingCard[] }),
    org.review_url && org.offers_appointments
      ? supabase
          .from("appointments")
          .select("id, starts_at, pets!appointments_org_id_client_id_pet_id_fkey(name, passed_away_on), clients(full_name, phone)")
          .eq("org_id", org.id)
          .eq("status", "done")
          .is("booking_id", null)
          .gte("starts_at", zonedInstant(weekAgo, "00:00", org.time_zone).toISOString())
          .limit(100)
      : Promise.resolve({ data: [] }),
  ]);
  const ended = [
    ...(endedStays.data ?? []).filter((b) => !b.pets?.passed_away_on).map((b) => ({ id: b.id, petName: b.pets?.name ?? "", parentName: b.clients?.full_name ?? "", phone: b.clients?.phone ?? "", endedOn: b.end_date })),
    ...(endedVisits.data ?? []).filter((a) => !a.pets?.passed_away_on).map((a) => ({ id: a.id, petName: a.pets?.name ?? "", parentName: a.clients?.full_name ?? "", phone: a.clients?.phone ?? "", endedOn: localDate(a.starts_at, org.time_zone) })),
  ]
    .filter((e) => e.phone)
    // One ask for each parent: the latest stay or visit.
    .sort((a, b) => b.endedOn.localeCompare(a.endedOn))
    .filter((e, i, all) => all.findIndex((x) => x.phone === e.phone) === i);
  const creditClients = [...new Set((credits.data ?? []).flatMap((c) => (c.client_id ? [c.client_id] : [])))];
  const creditParents = creditClients.length > 0 ? ((await supabase.from("clients").select("id, full_name, phone").eq("org_id", org.id).in("id", creditClients)).data ?? []) : [];
  const ids = [
    ...upcoming.map((b) => b.id),
    ...inHouse.map((b) => b.id),
    ...oldBills.map((b) => b.id),
    ...grooms.flatMap((g) => (g.last ? [g.last.id] : [])),
    ...(credits.data ?? []).flatMap((c) => (c.credit_id ? [c.credit_id] : [])),
    ...ended.map((e) => e.id),
  ];
  const [vaccinations, balances, sent] = await Promise.all([
    upcoming.length > 0
      ? supabase.from("vaccinations").select("pet_id, vaccine, valid_until").eq("org_id", org.id).in("pet_id", upcoming.map((b) => b.pets?.id ?? ""))
      : Promise.resolve({ data: [] }),
    oldBills.length > 0
      ? supabase.from("invoice_balances").select("invoice_id, due_minor").eq("org_id", org.id).in("invoice_id", oldBills.map((b) => b.id)).gt("due_minor", 0)
      : Promise.resolve({ data: [] }),
    ids.length > 0 ? supabase.from("reminders_sent").select("kind, subject_id, sent_on").eq("org_id", org.id).in("subject_id", ids) : Promise.resolve({ data: [] }),
  ]);
  const due = new Map((balances.data ?? []).map((b) => [b.invoice_id, b.due_minor ?? 0]));
  const stay = (b: BookingCard) => ({
    id: b.id,
    petName: b.pets?.name ?? "",
    parentName: b.clients?.full_name ?? "",
    phone: b.clients?.phone ?? "",
    startDate: b.start_date,
    endDate: b.end_date,
  });
  const p = parentI18n(org.parent_language, org.locale);
  return remindersToSend(
    p.m.whatsapp.reminders,
    {
      today,
      kennelName: org.name,
      dropOff: org.check_in_time,
      pickUp: org.check_out_time,
      currency: org.currency,
      upcoming: upcoming
        .filter((b) => b.clients)
        .map((b) => ({
          ...stay(b),
          vaccinations: (vaccinations.data ?? []).filter((v) => v.pet_id === b.pets?.id),
          lacks: lacksInWords(lacking.get(`${b.pets?.id}:${b.start_date}`) ?? [], p.m.health.problems),
        })),
      inHouse: inHouse.filter((b) => b.clients).map(stay),
      unpaid: oldBills
        // The walk-in buyer of the shop, and an erased parent, have no phone to remind.
        .filter((b) => b.clients?.phone && b.number && b.issued_on && due.has(b.id))
        .map((b) => ({
          id: b.id,
          number: b.number as string,
          parentName: b.clients?.full_name ?? "",
          phone: b.clients?.phone ?? "",
          issuedOn: b.issued_on as string,
          dueMinor: due.get(b.id) ?? 0,
          url: `${origin}/inv/${b.public_token}`,
        })),
      grooms,
      credits: (credits.data ?? []).flatMap((c) => {
        const parent = creditParents.find((x) => x.id === c.client_id);
        return c.credit_id && parent && c.expires_on ? [{ id: c.credit_id, parentName: parent.full_name, phone: parent.phone, leftMinor: c.left_minor ?? 0, expiresOn: c.expires_on }] : [];
      }),
      reviewUrl: org.review_url,
      ended,
      sent: (sent.data ?? []).map((x) => ({ kind: x.kind, subjectId: x.subject_id, sentOn: x.sent_on })),
    },
    p.locale,
  );
}

/** The question Send asks once WhatsApp has opened (M44), and its two answers. */
function sentWords({ m }: I18n) {
  return { didItGo: m.today.didItGo, itWent: m.today.itWent, notYet: m.today.notYet };
}

/** Pets with a groom interval on their grooming card, with their last groom done (M35). */
async function groomCards(supabase: Awaited<ReturnType<typeof createClient>>, org: { id: string; time_zone: string }): Promise<GroomCard[]> {
  const cards = await supabase
    .from("pet_grooming")
    .select("pet_id, every_weeks, pets(name, deleted_at, passed_away_on, clients(full_name, phone))")
    .eq("org_id", org.id)
    .not("every_weeks", "is", null)
    .limit(500);
  // Not a pet that has passed away (M52), nor one hidden from lists.
  const live = (cards.data ?? []).filter((c) => c.pets && !c.pets.deleted_at && !c.pets.passed_away_on && c.pets.clients);
  if (live.length === 0) return [];
  const done = await supabase
    .from("appointments")
    .select("id, pet_id, starts_at")
    .eq("org_id", org.id)
    .eq("kind", "groom")
    .eq("status", "done")
    .in("pet_id", live.map((c) => c.pet_id))
    .order("starts_at", { ascending: false })
    .limit(2000);
  return live.map((c) => {
    const last = (done.data ?? []).find((a) => a.pet_id === c.pet_id);
    return {
      petId: c.pet_id,
      petName: c.pets!.name,
      parentName: c.pets!.clients!.full_name,
      phone: c.pets!.clients!.phone,
      everyWeeks: c.every_weeks,
      last: last ? { id: last.id, day: localDate(last.starts_at, org.time_zone) } : null,
    };
  });
}
