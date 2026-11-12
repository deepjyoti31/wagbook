import type { Metadata } from "next";
import { Icon } from "@/components/icons";
import { HtmlLang } from "@/components/html-lang";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { buttonStyles, Loading, Meter, Section } from "@/components/ui";
import { datesText, shortStayText } from "@/lib/bookings";
import { formatDate, stayReport, todayIn, whatsappLink, type ISODate } from "@/lib/core";
import { ReportFigures } from "@/components/report-figures";
import { fill, isLanguage, LANGUAGE_NAMES, LANGUAGE_SHORT, LANGUAGES } from "@/lib/i18n";
import { parentI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";

interface PublicStay {
  kennel: { name: string; time_zone?: string; locale?: string; language?: string; whatsapp_phone: string | null; phone: string | null; check_in_time: string; check_out_time: string };
  pet: { name: string; species: string; breed: string | null; photo: string | null };
  booking: { kind: "boarding" | "daycare"; status: string; start_date: ISODate; end_date: ISODate; checked_in_at: string | null; checked_out_at: string | null };
  updates: { at: string; body: string; photos: string[] | null }[];
  care: { date: ISODate; kind: string; done: number; total: number }[];
  /** Once the pet has gone home (M53): the kennel's words and photos, and the records the report is worked out from. */
  report: {
    words: string | null;
    photos: string[] | null;
    tasks: { kind: string; label: string; status: string }[] | null;
    play: number | null;
    weights: { on: ISODate; grams: number }[] | null;
    incidents: { on: ISODate; category: string }[] | null;
  } | null;
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
export default function StayPage({ params, searchParams }: PageProps<"/s/[token]">) {
  return (
    <main className="wb-parent mx-auto w-full max-w-2xl flex-1 px-4 pt-3">
      <Suspense fallback={<Loading />}>
        <Stay params={params} searchParams={searchParams} />
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

async function Stay({ params, searchParams }: Pick<PageProps<"/s/[token]">, "params" | "searchParams">) {
  const { token } = await params;
  const found = await loadStay(token);
  if (!found) notFound();
  const { supabase, stay } = found;
  // The page opens in the kennel's language for parents; a parent can read it in another (?lang=).
  const asked = (await searchParams).lang;
  const t = parentI18n(isLanguage(asked) ? asked : stay.kennel.language, stay.kennel.locale);
  const { m } = t;
  const w = m.stayPage;

  // Short-lived links (an hour) to the photos, asked for with this stay's token.
  // The small copy is shown; tapping opens the photo itself.
  const paths = [stay.pet.photo, ...stay.updates.flatMap((u) => u.photos ?? []), ...(stay.report?.photos ?? [])].filter((p): p is string => Boolean(p));
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
  const [latest, ...earlierDays] = [...days.entries()];
  let today = "";
  try {
    today = todayIn(stay.kennel.time_zone ?? "Asia/Kolkata");
  } catch {
    // A time zone the server does not know: the care is shown with its date.
  }
  const FIRST_UPDATES = 3;
  const update = (u: PublicStay["updates"][number], i: number) => (
    <li key={i} className="rounded-2xl border border-rule bg-paper px-[18px] py-4">
      <p className="text-[13.5px] font-[650] text-slate">{when.format(new Date(u.at))}</p>
      <p className="mt-2 whitespace-pre-line">{u.body}</p>
      {(u.photos ?? []).some((p) => links.get(p)?.small) ? (
        <div className={`mt-3 grid gap-2 ${(u.photos ?? []).length > 1 ? "grid-cols-2" : "grid-cols-1"}`}>
          {(u.photos ?? []).map((p) => {
            const l = links.get(p);
            return l?.small ? (
              <a key={p} href={l.full ?? l.small} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file */}
                <img src={l.small} alt={fill(w.photoOf, { pet: stay.pet.name })} className={`w-full rounded-xl bg-ground object-cover ${(u.photos ?? []).length > 1 ? "aspect-square" : "aspect-[4/3]"}`} />
              </a>
            ) : null;
          })}
        </div>
      ) : null}
    </li>
  );

  return (
    <>
      <HtmlLang lang={t.language} />
      <header className="mb-3 flex items-center gap-2.5">
        <span aria-hidden="true" className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-ink font-extrabold text-paper">
          {stay.kennel.name.trim().charAt(0).toUpperCase()}
        </span>
        <p className="min-w-0 flex-1 truncate font-extrabold">{stay.kennel.name}</p>
        <nav aria-label={w.language} className="flex gap-0.5">
          {LANGUAGES.map((l) => (
            <a
              key={l}
              href={`/s/${token}?lang=${l}`}
              lang={l}
              aria-label={LANGUAGE_NAMES[l]}
              aria-current={l === t.language ? "true" : undefined}
              className={`inline-flex size-11 items-center justify-center rounded-[10px] text-sm font-bold ${l === t.language ? "border border-rule bg-paper text-ink" : "text-slate"}`}
            >
              {LANGUAGE_SHORT[l]}
            </a>
          ))}
        </nav>
      </header>
      {stay.pet.photo && links.get(stay.pet.photo)?.small ? (
        // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file
        <img src={links.get(stay.pet.photo)?.full ?? links.get(stay.pet.photo)?.small} alt={stay.pet.name} className="mb-4 aspect-[16/11] w-full rounded-3xl bg-ground object-cover" />
      ) : null}
      <p>
        <span className={`inline-flex min-h-[30px] items-center gap-2 rounded-full px-3 text-sm font-bold ${status.tone === "good" ? "bg-leaf-soft text-leaf-ink" : status.tone === "attention" ? "bg-marigold-soft text-marigold-ink" : "bg-fog text-steel"}`}>
          <span aria-hidden="true" className="size-2 rounded-full bg-current" />
          {status.label}
        </span>
      </p>
      <h1 className="mt-2.5 text-[30px] font-extrabold leading-[1.15] tracking-[-0.02em]">{fill(w.heading, { pet: stay.pet.name })}</h1>
      <p className="mb-5 mt-2 text-[17px]">
        {today ? shortStayText(t, stay.booking.kind, stay.booking.start_date, stay.booking.end_date, today) : datesText(t, stay.booking.start_date, stay.booking.end_date)}
        <span className="mt-1 block text-sm text-slate">{fill(w.times, { checkIn: stay.kennel.check_in_time, checkOut: stay.kennel.check_out_time })}</span>
      </p>

      {latest ? (
        <section aria-labelledby="care-given" className="mb-6 rounded-2xl border border-rule bg-paper px-[18px] py-4">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="care-given" className="text-[17px] font-[750]">
              {latest[0] === today ? w.careToday : w.careGiven}
            </h2>
            {latest[0] === today ? null : <span className="text-sm text-slate">{formatDate(latest[0], t.locale)}</span>}
          </div>
          <ul className="mt-1 divide-y divide-rule">
            {latest[1].map((c) => (
              <li key={c.kind} className="flex items-center gap-3 py-3 last:pb-0">
                <span className="w-[42%] font-bold">{w.careKinds[c.kind as keyof typeof w.careKinds] ?? w.careKinds.other}</span>
                <span className="min-w-0 flex-1">
                  <Meter value={c.done} total={c.total} tone="leaf" />
                </span>
                <span className="text-sm text-slate">{fill(w.doneOf, { done: c.done, total: c.total })}</span>
              </li>
            ))}
          </ul>
          {earlierDays.length > 0 ? (
            <details className="mt-2 border-t border-rule pt-1">
              <summary className="inline-flex min-h-11 cursor-pointer items-center text-[15px] font-[650] underline underline-offset-4">{w.earlierDays}</summary>
              <ul className="divide-y divide-rule">
                {earlierDays.map(([date, items]) => (
                  <li key={date} className="py-2.5">
                    <span className="font-bold">{formatDate(date, t.locale)}</span>
                    <span className="block text-sm text-slate">
                      {items.map((c) => fill(w.careDone[c.kind as keyof typeof w.careDone] ?? w.careDone.other, { done: c.done, total: c.total })).join(", ")}
                    </span>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
        </section>
      ) : null}

      {stay.report ? (
        <Section title={fill(m.stayReport.pageTitle, { pet: stay.pet.name })}>
          <div className="space-y-3 rounded-xl border border-rule bg-paper p-4">
            {stay.report.words ? (
              <div>
                <p className="whitespace-pre-line">{stay.report.words}</p>
                <p className="mt-1 text-sm text-slate">{fill(m.stayReport.fromKennel, { kennel: stay.kennel.name })}</p>
              </div>
            ) : null}
            {(stay.report.photos ?? []).length > 0 ? (
              <div className="grid grid-cols-2 gap-2">
                {(stay.report.photos ?? []).map((p) => {
                  const l = links.get(p);
                  return l?.small ? (
                    <a key={p} href={l.full ?? l.small} target="_blank" rel="noreferrer">
                      {/* eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file */}
                      <img src={l.small} alt={stay.pet.name} className="aspect-square w-full rounded-lg object-cover" />
                    </a>
                  ) : null;
                })}
              </div>
            ) : null}
            <ReportFigures
              m={m}
              language={t.language}
              locale={t.locale}
              kind={stay.booking.kind}
              report={stayReport({
                kind: stay.booking.kind,
                startDate: stay.booking.start_date,
                endDate: stay.booking.end_date,
                tasks: stay.report.tasks ?? [],
                play: stay.report.play ?? 0,
                weights: stay.report.weights ?? [],
                incidents: stay.report.incidents ?? [],
              })}
            />
          </div>
        </Section>
      ) : null}

      <section aria-labelledby="updates" className="mb-6">
        <h2 id="updates" className="mb-3 text-xl font-extrabold tracking-[-0.01em]">
          {w.updates}
        </h2>
        {stay.updates.length === 0 ? (
          <p className="text-slate">{w.noUpdates}</p>
        ) : (
          <>
            <ul className="space-y-3">{stay.updates.slice(0, FIRST_UPDATES).map(update)}</ul>
            {stay.updates.length > FIRST_UPDATES ? (
              <details className="group mt-3">
                <summary className="flex min-h-[50px] cursor-pointer list-none items-center justify-center rounded-2xl border border-rule bg-paper text-[15px] font-bold group-open:hidden [&::-webkit-details-marker]:hidden">
                  {fill(w.earlierUpdates, { n: stay.updates.length - FIRST_UPDATES })}
                </summary>
                <ul className="space-y-3">{stay.updates.slice(FIRST_UPDATES).map((u, i) => update(u, i + FIRST_UPDATES))}</ul>
              </details>
            ) : null}
          </>
        )}
      </section>

      <p className="pb-6 text-center text-[13px] text-slate">{w.madeWith}</p>

      {contact ? (
        // Kept in reach at the foot of the screen while the parent scrolls the updates.
        <div className="sticky bottom-0 -mx-4 border-t border-rule bg-cream px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3">
          <a
            href={whatsappLink(fill(m.whatsapp.askAbout, { pet: stay.pet.name }), contact)}
            target="_blank"
            rel="noreferrer"
            className={`${buttonStyles.whatsapp} w-full`}
          >
            <Icon name="chat" />
            {fill(w.message, { kennel: stay.kennel.name })}
          </a>
        </div>
      ) : null}
    </>
  );
}
