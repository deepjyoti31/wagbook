import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { HtmlLang } from "@/components/html-lang";
import { Loading } from "@/components/ui";
import { fill } from "@/lib/i18n";
import { parentI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";
import { submitBookingForm } from "./actions";
import { BookingForm, type BookingFormKennel } from "./booking-form";

/** The kennel behind a booking form link, from get_public_intake_form(): nothing private. Read once per request. */
const loadKennel = cache(async (slug: string): Promise<(BookingFormKennel & { intake_enabled: boolean; language: string }) | null> => {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{3,40}$/i.test(slug)) return null;
  const { data, error } = await createAnonClient().rpc("get_public_intake_form", { p_slug: slug });
  if (error || !data) return null;
  return data as unknown as BookingFormKennel & { intake_enabled: boolean; language: string };
});

export async function generateMetadata({ params }: PageProps<"/book/[slug]">): Promise<Metadata> {
  const kennel = await loadKennel((await params).slug);
  return { title: kennel ? fill(parentI18n(kennel.language).m.bookingForm.title, { kennel: kennel.name }) : "Wagbook", robots: { index: false } };
}

/**
 * The booking form for new parents (M41): any service the kennel offers,
 * when, pick-up from home, the pet, a tick for vaccinations and a phone
 * number, with an estimate. No sign-in; it lands in Intake forms.
 */
export default function BookPage({ params }: PageProps<"/book/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Suspense fallback={<Loading />}>
        <Book params={params} />
      </Suspense>
    </main>
  );
}

async function Book({ params }: Pick<PageProps<"/book/[slug]">, "params">) {
  const { slug } = await params;
  const kennel = await loadKennel(slug);
  if (!kennel) notFound();
  // Parents read this page in the language the kennel chose for them.
  const { language, m } = parentI18n(kennel.language, kennel.locale);
  const w = m.bookingForm;

  return (
    <div lang={language}>
      <HtmlLang lang={language} />
      <h1 className="text-3xl font-extrabold tracking-tight">{fill(w.title, { kennel: kennel.name })}</h1>
      <p className="mb-6 mt-2 text-lg text-slate">{w.intro}</p>
      {kennel.intake_enabled ? (
        <BookingForm
          action={submitBookingForm.bind(null, slug.toLowerCase(), language)}
          kennel={kennel}
          words={w}
          intake={m.intakeForm}
          shared={{ species: m.labels.species, sex: m.labels.sex, yes: m.common.yes, no: m.common.no }}
        />
      ) : (
        <p className="rounded-xl border border-rule bg-paper p-6 text-lg">{fill(m.intakeForm.closed, { kennel: kennel.name })}</p>
      )}
    </div>
  );
}
