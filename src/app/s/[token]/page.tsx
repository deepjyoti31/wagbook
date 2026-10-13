import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, buttonStyles, Loading, Section } from "@/components/ui";
import { formatDate, whatsappLink, type ISODate } from "@/lib/core";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Your pet's stay", robots: { index: false } };

interface PublicStay {
  kennel: { name: string; time_zone?: string; locale?: string; whatsapp_phone: string | null; phone: string | null; check_in_time: string; check_out_time: string };
  pet: { name: string; species: string; breed: string | null };
  booking: { kind: "boarding" | "daycare"; status: string; start_date: ISODate; end_date: ISODate; checked_in_at: string | null; checked_out_at: string | null };
  updates: { at: string; body: string }[];
  care: { date: ISODate; kind: string; done: number; total: number }[];
}

const STATUS: Record<string, { label: string; tone: "neutral" | "attention" | "good" }> = {
  requested: { label: "Waiting for the kennel to confirm", tone: "attention" },
  confirmed: { label: "Confirmed", tone: "neutral" },
  checked_in: { label: "Staying with us now", tone: "good" },
  checked_out: { label: "Gone home", tone: "neutral" },
  no_show: { label: "Did not arrive", tone: "neutral" },
};

const CARE_LABEL: Record<string, string> = { meal: "meals", medication: "medicines", walk: "walks", play: "play sessions", cleaning: "cleaning", other: "other care" };

/** What a parent sees when they open the link the kennel sent them. No sign-in. */
export default function StayPage({ params }: PageProps<"/s/[token]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Suspense fallback={<Loading />}>
        <Stay params={params} />
      </Suspense>
    </main>
  );
}

/** Times are shown on the kennel's clock, not the server's or the parent's. Falls back if the stored values are unusable. */
function clock(locale = "en-IN", timeZone = "Asia/Kolkata"): Intl.DateTimeFormat {
  const options = { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" } as const;
  try {
    return new Intl.DateTimeFormat(locale, { ...options, timeZone });
  } catch {
    return new Intl.DateTimeFormat("en-IN", { ...options, timeZone: "Asia/Kolkata" });
  }
}

async function Stay({ params }: Pick<PageProps<"/s/[token]">, "params">) {
  const { token } = await params;
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) notFound();

  const { data, error } = await createAnonClient().rpc("get_public_stay", { p_token: token });
  if (error || !data) notFound();
  const stay = data as unknown as PublicStay;
  const status = STATUS[stay.booking.status] ?? STATUS.confirmed;
  const contact = stay.kennel.whatsapp_phone ?? stay.kennel.phone;

  // Group the care counts by day, newest first.
  const days = new Map<string, PublicStay["care"]>();
  for (const c of stay.care) days.set(c.date, [...(days.get(c.date) ?? []), c]);

  const when = clock(stay.kennel.locale, stay.kennel.time_zone);

  return (
    <>
      <p className="font-semibold text-slate">{stay.kennel.name}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{stay.pet.name}&apos;s stay</h1>
      <p className="mt-3">
        <Badge tone={status.tone}>{status.label}</Badge>
      </p>
      <p className="mb-8 mt-3 text-lg">
        {stay.booking.start_date === stay.booking.end_date
          ? formatDate(stay.booking.start_date)
          : `${formatDate(stay.booking.start_date)} to ${formatDate(stay.booking.end_date)}`}
        <span className="block text-base text-slate">
          Drop-off from {stay.kennel.check_in_time}. Pick-up by {stay.kennel.check_out_time}.
        </span>
      </p>

      <Section title="Updates">
        {stay.updates.length === 0 ? (
          <p className="text-slate">No updates yet. Photos come to you on WhatsApp; notes from the team appear here.</p>
        ) : (
          <ul className="space-y-3">
            {stay.updates.map((u, i) => (
              <li key={i} className="rounded-xl border border-rule bg-paper p-4">
                <p className="whitespace-pre-line">{u.body}</p>
                <p className="mt-1 text-sm text-slate">{when.format(new Date(u.at))}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {days.size > 0 ? (
        <Section title="Care given">
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {[...days.entries()].map(([date, items]) => (
              <li key={date} className="px-4 py-3">
                <span className="font-bold">{formatDate(date)}</span>
                <span className="block text-slate">
                  {items.map((c) => `${c.done} of ${c.total} ${CARE_LABEL[c.kind] ?? c.kind}`).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {contact ? (
        <a
          href={whatsappLink(`Hi, I am asking about ${stay.pet.name}.`, contact)}
          target="_blank"
          rel="noreferrer"
          className={`${buttonStyles.whatsapp} w-full`}
        >
          Message {stay.kennel.name} on WhatsApp
        </a>
      ) : null}
    </>
  );
}
