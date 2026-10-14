import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Empty, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { flagText } from "@/lib/bookings";
import { CARE_KIND_PLURAL, CARE_KINDS } from "@/lib/care";
import { dailyUpdateMessage, formatDate, formatPhone, isOverstaying, todayIn, whatsappLink } from "@/lib/core";
import { bookingCards, type BookingCard } from "@/lib/queries";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { checkIn, checkOut } from "./actions";
import { extendToToday } from "./bookings/actions";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage({ searchParams }: PageProps<"/app">) {
  return (
    <Suspense fallback={<Loading label="Loading today" />}>
      <Today searchParams={searchParams} />
    </Suspense>
  );
}

/** What to say after a step that moves a pet off its list (the form that was pressed goes with it). */
const DONE: Record<string, string> = {
  checked_in: "Checked in.",
  checked_out: "Checked out. The kennel is free for the next pet.",
  extended: "Stay extended to today.",
};

async function Today({ searchParams }: Pick<PageProps<"/app">, "searchParams">) {
  const query = await searchParams;
  const doneKey = query.done;
  // After a check-out, the next job is the bill.
  const billFor = doneKey === "checked_out" && typeof query.booking === "string" && /^[0-9a-f-]{36}$/.test(query.booking) ? query.booking : null;
  const done = typeof doneKey === "string" && doneKey in DONE ? DONE[doneKey] : null;
  const { org } = await requireOrg();
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  // Make sure today's care tasks exist before counting them. Safe to repeat.
  const generated = await supabase.rpc("generate_care_tasks", { p_org: org.id, p_date: today });
  if (generated.error) console.error("generate_care_tasks failed", generated.error.message);

  const [arrivalsRes, inHouseRes, kennelsRes, intakeRes, tasksRes, origin] = await Promise.all([
    // Confirmed and due today or earlier: includes anyone who was expected yesterday and has not turned up.
    bookingCards(supabase, org.id).eq("status", "confirmed").lte("start_date", today).order("start_date"),
    bookingCards(supabase, org.id).eq("status", "checked_in").order("end_date"),
    supabase.from("kennels").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("is_active", true),
    supabase.from("intake_submissions").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "new"),
    supabase.from("care_tasks").select("kind, status").eq("org_id", org.id).eq("task_date", today).limit(10000),
    siteOrigin(),
  ]);
  if (arrivalsRes.error || inHouseRes.error) throw new Error("Could not load today's bookings.");

  const arrivals = arrivalsRes.data;
  const inHouse = inHouseRes.data;
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
      <PageTitle title={formatDate(today)}>
        <Link href="/app/bookings/new" className={buttonStyles.primary}>
          New booking
        </Link>
      </PageTitle>

      {done ? (
        <Notice tone="ok">
          {done}
          {billFor ? (
            <>
              {" "}
              <Link href={`/app/bookings/${billFor}`} className="underline underline-offset-4">
                Make the bill
              </Link>
            </>
          ) : null}
        </Notice>
      ) : null}

      <p className="mb-6 text-lg">
        <strong className="font-extrabold">{inHouse.length}</strong> in house
        {capacity > 0 ? (
          <>
            {" "}
            of <strong className="font-extrabold">{capacity}</strong> kennels
          </>
        ) : null}
        . <strong className="font-extrabold">{arrivals.length}</strong> to arrive.
      </p>

      {capacity === 0 ? (
        <p className="mb-6 rounded-lg bg-marigold-soft px-4 py-3">
          You have not added any kennels yet, so Wagbook cannot stop you overbooking.{" "}
          <Link href="/app/more/kennels" className="font-semibold underline underline-offset-4">
            Add your kennels
          </Link>
        </p>
      ) : null}
      {newForms > 0 ? (
        <p className="mb-6 rounded-lg bg-marigold-soft px-4 py-3">
          {newForms === 1 ? "One new form from a parent is" : `${newForms} new forms from parents are`} waiting.{" "}
          <Link href="/app/more/intake" className="font-semibold underline underline-offset-4">
            Review
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
              {CARE_KIND_PLURAL[c.kind]} {c.done} of {c.total}
            </Link>
          ))}
        </div>
      ) : null}

      <Section title="Arriving" count={arrivals.length}>
        {arrivals.length === 0 ? (
          <Empty>Nobody is due to arrive today.</Empty>
        ) : (
          <Ledger>
            {arrivals.map((b, i) => (
              <LedgerRow key={b.id}>
                <BookingSummary booking={b} today={today} />
                <ActionForm action={checkIn} className="flex w-full flex-wrap items-end gap-2 sm:w-auto">
                  <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="from" value="today" />
                  <label className="min-w-36 flex-1">
                    <span className="sr-only">Kennel for {b.pets?.name}</span>
                    <Select name="kennelId" defaultValue={b.kennel_id ?? ""}>
                      <option value="">No kennel yet</option>
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
                  <SubmitButton pendingLabel="Checking in">Check in</SubmitButton>
                </ActionForm>
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      <Section title="In house" count={inHouse.length}>
        {inHouse.length === 0 ? (
          <Empty>No pets are checked in.</Empty>
        ) : (
          <Ledger>
            {inHouse.map((b) => (
              <LedgerRow key={b.id}>
                <BookingSummary booking={b} today={today} />
                <div className="flex w-full flex-wrap gap-2 sm:w-auto">
                  {isOverstaying({ status: b.status, endDate: b.end_date }, today) ? (
                    <ActionForm action={extendToToday} className="contents">
                      <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="from" value="today" />
                      <SubmitButton variant="secondary" pendingLabel="Extending">
                        Extend to today
                      </SubmitButton>
                    </ActionForm>
                  ) : null}
                  {b.clients ? (
                    <a
                      href={whatsappLink(
                        dailyUpdateMessage({ petName: b.pets?.name ?? "Your pet", note: "", stayUrl: `${origin}/s/${b.public_token}` }),
                        b.clients.phone,
                      )}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonStyles.whatsapp}
                    >
                      Send update
                    </a>
                  ) : null}
                  <ActionForm action={checkOut} className="contents">
                    <input type="hidden" name="bookingId" value={b.id} />
                    <input type="hidden" name="from" value="today" />
                    <SubmitButton pendingLabel="Checking out" variant={b.end_date <= today ? "primary" : "secondary"}>
                      Check out
                    </SubmitButton>
                  </ActionForm>
                </div>
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>
    </>
  );
}

function BookingSummary({ booking: b, today }: { booking: BookingCard; today: string }) {
  const leavesToday = b.status === "checked_in" && b.end_date === today;
  const overdue = b.status === "checked_in" && b.end_date < today;
  const late = b.status === "confirmed" && b.start_date < today;
  return (
    <div className="min-w-0 flex-1 basis-64">
      <p className="flex flex-wrap items-center gap-2">
        <DoorTag name={b.kennels?.name} />
        <Link href={`/app/bookings/${b.id}`} className="text-lg font-bold underline-offset-4 hover:underline">
          {b.pets?.name ?? "Unknown pet"}
        </Link>
        {b.pets?.breed ? <span className="text-slate">{b.pets.breed}</span> : null}
        {b.kind === "daycare" ? <Badge>Day boarding</Badge> : null}
        {leavesToday ? <Badge tone="attention">Leaves today</Badge> : null}
        {overdue ? <Badge tone="alert">Was due to leave {formatDate(b.end_date)}</Badge> : null}
        {late ? <Badge tone="alert">Was due {formatDate(b.start_date)}</Badge> : null}
        {(b.pets?.flags ?? []).map((f) => (
          <Badge key={f} tone="alert">
            {flagText(f)}
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
        {b.kind === "daycare" && b.start_date === b.end_date
          ? formatDate(b.start_date)
          : `${formatDate(b.start_date)} to ${formatDate(b.end_date)}`}
      </p>
    </div>
  );
}
