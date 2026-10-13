import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, DoorTag, Empty, Ledger, LedgerRow, Loading, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { dailyUpdateMessage, formatDate, formatPhone, todayIn, whatsappLink } from "@/lib/core";
import { bookingCards, type BookingCard } from "@/lib/queries";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { checkIn, checkOut } from "./actions";

export const metadata: Metadata = { title: "Today" };

export default function TodayPage() {
  return (
    <Suspense fallback={<Loading label="Loading today" />}>
      <Today />
    </Suspense>
  );
}

async function Today() {
  const { org } = await requireOrg();
  const supabase = await createClient();
  const today = todayIn(org.time_zone);

  const [arrivalsRes, inHouseRes, kennelsRes, intakeRes, origin] = await Promise.all([
    // Confirmed and due today or earlier: includes anyone who was expected yesterday and has not turned up.
    bookingCards(supabase, org.id).eq("status", "confirmed").lte("start_date", today).order("start_date"),
    bookingCards(supabase, org.id).eq("status", "checked_in").order("end_date"),
    supabase.from("kennels").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("is_active", true),
    supabase.from("intake_submissions").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "new"),
    siteOrigin(),
  ]);
  if (arrivalsRes.error || inHouseRes.error) throw new Error("Could not load today's bookings.");

  const arrivals = arrivalsRes.data;
  const inHouse = inHouseRes.data;
  const capacity = kennelsRes.count ?? 0;
  const newForms = intakeRes.count ?? 0;

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
        <span className="text-lg font-bold">{b.pets?.name ?? "Unknown pet"}</span>
        {b.pets?.breed ? <span className="text-slate">{b.pets.breed}</span> : null}
        {b.kind === "daycare" ? <Badge>Day boarding</Badge> : null}
        {leavesToday ? <Badge tone="attention">Leaves today</Badge> : null}
        {overdue ? <Badge tone="alert">Was due to leave {formatDate(b.end_date)}</Badge> : null}
        {late ? <Badge tone="alert">Was due {formatDate(b.start_date)}</Badge> : null}
        {(b.pets?.flags ?? []).map((f) => (
          <Badge key={f} tone="alert">
            {f.replaceAll("_", " ")}
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
