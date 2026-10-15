import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Empty, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { Rich } from "@/components/rich";
import { requireOrg } from "@/lib/auth";
import { datesText, flagText } from "@/lib/bookings";
import { CARE_KINDS } from "@/lib/care";
import { addDays, dailySummaryMessage, EXPIRES_SOON_DAYS, formatDate, formatPhone, isOverstaying, todayIn, vaccinationWarnings, whatsappLink } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n, type I18n } from "@/lib/i18n-server";
import { signedUrls } from "@/lib/media";
import { PetAvatar } from "@/components/pet-avatar";
import { bookingCards, type BookingCard } from "@/lib/queries";
import { createClient } from "@/lib/supabase/server";
import { checkIn, checkOut } from "./actions";
import { extendToToday } from "./bookings/actions";

export const generateMetadata = () => appTitle((m) => m.today.title);

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

  const [arrivalsRes, inHouseRes, kennelsRes, intakeRes, tasksRes, incidentsRes] = await Promise.all([
    // Confirmed and due today or earlier: includes anyone who was expected yesterday and has not turned up.
    bookingCards(supabase, org.id).eq("status", "confirmed").lte("start_date", today).order("start_date"),
    bookingCards(supabase, org.id).eq("status", "checked_in").order("end_date"),
    supabase.from("kennels").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("is_active", true),
    supabase.from("intake_submissions").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "new"),
    supabase.from("care_tasks").select("kind, status").eq("org_id", org.id).eq("task_date", today).limit(10000),
    // Incidents still open that matter now: serious ones, and any the parent has not been told about.
    supabase
      .from("incidents")
      .select("id, severity, category, description, parent_notified_at, pets(id, name)")
      .eq("org_id", org.id)
      .is("resolved_at", null)
      .in("severity", ["medium", "high"])
      .order("occurred_at", { ascending: false })
      .limit(20),
  ]);
  if (arrivalsRes.error || inHouseRes.error) throw new Error("Could not load today's bookings.");

  const arrivals = arrivalsRes.data;
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
  const capacity = kennelsRes.count ?? 0;
  const newForms = intakeRes.count ?? 0;
  // Done out of what is owed: a task skipped on purpose is no longer owed.
  const care = CARE_KINDS.map((kind) => {
    const mine = (tasksRes.data ?? []).filter((t) => t.kind === kind && t.status !== "skipped");
    return { kind, done: mine.filter((t) => t.status === "done").length, total: mine.length };
  }).filter((c) => c.total > 0);

  // Kennels free for each arrival's whole stay.
  const freeKennels = await Promise.all(
    arrivals.map(async (b) => {
      const { data } = await supabase.rpc("available_kennels", { p_org: org.id, p_kind: b.kind, p_start: b.start_date, p_end: b.end_date });
      return (data ?? []).map((k) => ({ id: k.id, name: k.name }));
    }),
  );

  return (
    <>
      <PageTitle title={formatDate(today, locale)}>
        <Link href="/app/bookings/new" className={buttonStyles.primary}>
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

      <p className="mb-6 text-lg">
        <Rich
          text={capacity > 0 ? m.today.inHouseOf : m.today.inHouse}
          parts={{ inHouse: <strong className="font-extrabold">{inHouse.length}</strong>, capacity: <strong className="font-extrabold">{capacity}</strong> }}
        />{" "}
        <Rich text={m.today.toArrive} parts={{ arrivals: <strong className="font-extrabold">{arrivals.length}</strong> }} />
      </p>

      {capacity === 0 ? (
        <p className="mb-6 rounded-lg bg-marigold-soft px-4 py-3">
          {m.today.noKennels}{" "}
          <Link href="/app/more/kennels" className="font-semibold underline underline-offset-4">
            {m.today.addKennels}
          </Link>
        </p>
      ) : null}
      {newForms > 0 ? (
        <p className="mb-6 rounded-lg bg-marigold-soft px-4 py-3">
          {plural(language, newForms, m.today.newForms)}{" "}
          <Link href="/app/more/intake" className="font-semibold underline underline-offset-4">
            {m.today.review}
          </Link>
        </p>
      ) : null}

      {care.length > 0 ? (
        <div className="mb-7 flex flex-wrap gap-2">
          {care.map((c) => (
            <Link
              key={c.kind}
              href={`/app/care?kind=${c.kind}&show=pending`}
              className={`inline-flex min-h-12 items-center gap-2 rounded-lg border px-4 font-semibold ${
                c.done === c.total ? "border-leaf bg-leaf-soft text-leaf" : c.kind === "medication" ? "border-alert bg-alert-soft text-alert" : "border-rule bg-paper"
              }`}
            >
              {fill(m.today.careCount, { kind: m.labels.careKindPlural[c.kind], done: c.done, total: c.total })}
            </Link>
          ))}
        </div>
      ) : null}

      {incidents.length > 0 ? (
        <Section title={m.today.incidents} count={incidents.length}>
          <ul className="space-y-2">
            {incidents.map((i) => (
              <li key={i.id}>
                <Link href={`/app/dogs/${i.pets?.id}`} className="block rounded-xl border-2 border-alert bg-alert-soft px-4 py-3 text-ink">
                  <span className="flex flex-wrap items-center gap-2 font-bold">
                    {i.pets?.name}
                    <Badge tone="alert">{m.labels.severityShort[i.severity]}</Badge>
                    {i.parent_notified_at ? null : <Badge tone="attention">{m.today.parentNotTold}</Badge>}
                  </span>
                  <span className="mt-1 line-clamp-2 block">{i.description}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      <Section title={m.today.arriving} count={arrivals.length}>
        {arrivals.length === 0 ? (
          <Empty>{m.today.nobodyArriving}</Empty>
        ) : (
          <Ledger>
            {arrivals.map((b, i) => (
              <LedgerRow key={b.id}>
                <BookingSummary
                  t={t}
                  booking={b}
                  today={today}
                  photo={b.pets?.photo_path ? photos.get(b.pets.photo_path) : null}
                  vaccineWarning={(vaccineWarnings.get(b.id) ?? []).length > 0}
                />
                <ActionForm action={checkIn} className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                  <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="from" value="today" />
                  <label className="min-w-36 flex-1">
                    <span className="sr-only">{fill(m.today.kennelFor, { pet: b.pets?.name ?? "" })}</span>
                    <Select name="kennelId" defaultValue={b.kennel_id ?? ""}>
                      <option value="">{m.today.noKennelYet}</option>
                      {b.kennels ? <option value={b.kennels.id}>{b.kennels.name}</option> : null}
                      {freeKennels[i]
                        .filter((k) => k.id !== b.kennel_id)
                        .map((k) => (
                          <option key={k.id} value={k.id}>
                            {k.name}
                          </option>
                        ))}
                    </Select>
                  </label>
                  <SubmitButton pendingLabel={m.today.checkingIn}>{m.today.checkIn}</SubmitButton>
                </ActionForm>
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      <Section title={m.today.inHouseTitle} count={inHouse.length}>
        {inHouse.length === 0 ? (
          <Empty>{m.today.noneInHouse}</Empty>
        ) : (
          <Ledger>
            {inHouse.map((b) => (
              <LedgerRow key={b.id}>
                <BookingSummary t={t} booking={b} today={today} photo={b.pets?.photo_path ? photos.get(b.pets.photo_path) : null} />
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  {isOverstaying({ status: b.status, endDate: b.end_date }, today) ? (
                    <ActionForm action={extendToToday} className="contents">
                      <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="from" value="today" />
                      <SubmitButton variant="secondary" pendingLabel={m.today.extending}>
                        {m.today.extend}
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                  <Link href={`/app/bookings/${b.id}/update`} className={buttonStyles.whatsapp}>
                    {m.today.writeUpdate}
                  </Link>
                  {b.pets ? (
                    <Link href={`/app/dogs/${b.pets.id}/incident`} className={buttonStyles.quiet}>
                      {m.today.incident}
                    </Link>
                  ) : null}
                  <ActionForm action={checkOut} className="contents">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="from" value="today" />
                    <SubmitButton pendingLabel={m.today.checkingOut} variant={b.end_date <= today ? "primary" : "secondary"}>
                      {m.today.checkOut}
                    </SubmitButton>
                  </ActionForm>
                </div>
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      {canManage ? (
        <Suspense fallback={null}>
          <TomorrowSummary t={t} today={today} />
        </Suspense>
      ) : null}
    </>
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

function BookingSummary({ t, booking: b, today, photo, vaccineWarning }: { t: I18n; booking: BookingCard; today: string; photo?: string | null; vaccineWarning?: boolean }) {
  const { m, locale } = t;
  const leavesToday = b.status === "checked_in" && b.end_date === today;
  const overdue = b.status === "checked_in" && b.end_date < today;
  const late = b.status === "confirmed" && b.start_date < today;
  return (
    <div className="flex min-w-0 flex-1 basis-64 gap-3">
      <PetAvatar name={b.pets?.name ?? "?"} url={photo} />
      <div className="min-w-0 flex-1">
      <p className="flex flex-wrap items-center gap-2">
        <DoorTag name={b.kennels?.name} empty={m.common.noKennel} />
        <Link href={`/app/bookings/${b.id}`} className="text-lg font-bold underline-offset-4 hover:underline">
          {b.pets?.name ?? m.today.unknownPet}
        </Link>
        {b.pets?.breed ? <span className="text-slate">{b.pets.breed}</span> : null}
        {b.kind === "daycare" ? <Badge>{m.labels.bookingKind.daycare}</Badge> : null}
        {leavesToday ? <Badge tone="attention">{m.today.leavesToday}</Badge> : null}
        {overdue ? <Badge tone="alert">{fill(m.today.wasDueToLeave, { date: formatDate(b.end_date, locale) })}</Badge> : null}
        {late ? <Badge tone="alert">{fill(m.today.wasDue, { date: formatDate(b.start_date, locale) })}</Badge> : null}
        {vaccineWarning ? <Badge tone="attention">{m.today.checkVaccinations}</Badge> : null}
        {(b.pets?.flags ?? []).map((f) => (
          <Badge key={f} tone="alert">
            {flagText(m, f)}
          </Badge>
        ))}
      </p>
      <p className="mt-1 text-slate">
        {b.clients ? (
          <>
            {b.clients.full_name},{" "}
            <a href={`tel:${b.clients.phone}`} className="underline underline-offset-4">
              {formatPhone(b.clients.phone)}
            </a>
            .{" "}
          </>
        ) : null}
        {datesText(t, b.start_date, b.end_date)}
      </p>
      </div>
    </div>
  );
}
