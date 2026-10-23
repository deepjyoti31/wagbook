import type { Metadata } from "next";
import { HtmlLang } from "@/components/html-lang";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { Badge, buttonStyles, Loading, Section } from "@/components/ui";
import { datesText } from "@/lib/bookings";
import { formatDate, whatsappLink, type ISODate } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { parentI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

interface PublicStay {
  kennel: { name: string; time_zone?: string; locale?: string; language?: string; whatsapp_phone: string | null; phone: string | null; check_in_time: string; check_out_time: string };
  pet: { name: string; species: string; breed: string | null; photo: string | null };
  booking: { kind: "boarding" | "daycare"; status: string; start_date: ISODate; end_date: ISODate; checked_in_at: string | null; checked_out_at: string | null };
  updates: { at: string; body: string; photos: string[] | null }[];
  care: { date: ISODate; kind: string; done: number; total: number }[];
}

const TONE: Record<string, "neutral" | "attention" | "good"> = { requested: "attention", checked_in: "good" };

/**
 * The stay, found by its secret token, or null. Cached for the request, so the
 * tab title (in the kennel's language for parents) and the page share one call.
 */
const loadStay = cache(async (token: string) => {
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) return null;
  const supabase = createAnonClient({ stayToken: token });
  const { data, error } = await supabase.rpc("get_public_stay", { p_token: token });
  if (error || !data) return null;
  return { supabase, stay: data as unknown as PublicStay };
});

export async function generateMetadata({ params }: PageProps<"/s/[token]">): Promise<Metadata> {
  const found = await loadStay((await params).token);
  const { m } = parentI18n(found?.stay.kennel.language, found?.stay.kennel.locale);
  return { title: m.stayPage.title, robots: { index: false } };
}

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
  const found = await loadStay(token);
  if (!found) notFound();
  const { supabase, stay } = found;
  const t = parentI18n(stay.kennel.language, stay.kennel.locale);
  const { m } = t;
  const w = m.stayPage;

  // Short-lived links (an hour) to the photos, asked for with this stay's token.
  // The small copy is shown; tapping opens the photo itself.
  const paths = [stay.pet.photo, ...stay.updates.flatMap((u) => u.photos ?? [])].filter((p): p is string => Boolean(p));
  const links = new Map<string, { small?: string; full?: string }>();
  if (paths.length > 0) {
    const small = (p: string) => p.replace(/\.jpg$/, ".small.jpg");
    const { data: signed } = await supabase.storage.from("pet-media").createSignedUrls([...paths, ...paths.map(small)], 3600);
    const byPath = new Map((signed ?? []).filter((x) => x.signedUrl && !x.error).map((x) => [x.path ?? "", x.signedUrl as string]));
    // Once a month's photos are archived (M49) only the small copy is left, and it serves for both.
    for (const p of paths) links.set(p, { small: byPath.get(small(p)) ?? byPath.get(p), full: byPath.get(p) ?? byPath.get(small(p)) });
  }
  const statusKey = Object.hasOwn(w.status, stay.booking.status) ? (stay.booking.status as keyof typeof w.status) : "confirmed";
  const status = { label: w.status[statusKey], tone: TONE[statusKey] ?? "neutral" };
  const contact = stay.kennel.whatsapp_phone ?? stay.kennel.phone;

  // Group the care counts by day, newest first.
  const days = new Map<string, PublicStay["care"]>();
  for (const c of stay.care) days.set(c.date, [...(days.get(c.date) ?? []), c]);

  const when = clock(t.locale, stay.kennel.time_zone);

  return (
    <>
      <HtmlLang lang={t.language} />
      {stay.pet.photo && links.get(stay.pet.photo)?.small ? (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file
        <img src={links.get(stay.pet.photo)?.small} alt={stay.pet.name} className="mb-3 size-24 rounded-full object-cover" />
      ) : null}
      <p className="font-semibold text-slate">{stay.kennel.name}</p>
      <h1 className="mt-1 text-3xl font-extrabold tracking-tight">{fill(w.heading, { pet: stay.pet.name })}</h1>
      <p className="mt-3">
        <Badge tone={status.tone}>{status.label}</Badge>
      </p>
      <p className="mb-8 mt-3 text-lg">
        {datesText(t, stay.booking.start_date, stay.booking.end_date)}
        <span className="block text-base text-slate">{fill(w.times, { checkIn: stay.kennel.check_in_time, checkOut: stay.kennel.check_out_time })}</span>
      </p>

      <Section title={w.updates}>
        {stay.updates.length === 0 ? (
          <p className="text-slate">{w.noUpdates}</p>
        ) : (
          <ul className="space-y-3">
            {stay.updates.map((u, i) => (
              <li key={i} className="rounded-xl border border-rule bg-paper p-4">
                {(u.photos ?? []).length > 0 ? (
                  <div className="mb-3 grid grid-cols-2 gap-2">
                    {(u.photos ?? []).map((p) => {
                      const l = links.get(p);
                      return l?.small ? (
                        <a key={p} href={l.full ?? l.small} target="_blank" rel="noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file */}
                          <img src={l.small} alt={`${stay.pet.name}`} className="aspect-square w-full rounded-lg object-cover" />
                        </a>
                      ) : null;
                    })}
                  </div>
                ) : null}
                <p className="whitespace-pre-line">{u.body}</p>
                <p className="mt-1 text-sm text-slate">{when.format(new Date(u.at))}</p>
              </li>
            ))}
          </ul>
        )}
      </Section>

      {days.size > 0 ? (
        <Section title={w.careGiven}>
          <ul className="divide-y divide-rule overflow-hidden rounded-xl border border-rule bg-paper">
            {[...days.entries()].map(([date, items]) => (
              <li key={date} className="px-4 py-3">
                <span className="font-bold">{formatDate(date, t.locale)}</span>
                <span className="block text-slate">
                  {items.map((c) => fill(w.careDone[c.kind as keyof typeof w.careDone] ?? w.careDone.other, { done: c.done, total: c.total })).join(", ")}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}

      {contact ? (
        <a
          href={whatsappLink(fill(m.whatsapp.askAbout, { pet: stay.pet.name }), contact)}
          target="_blank"
          rel="noreferrer"
          className={`${buttonStyles.whatsapp} w-full`}
        >
          {fill(w.message, { kennel: stay.kennel.name })}
        </a>
      ) : null}
    </>
  );
}
