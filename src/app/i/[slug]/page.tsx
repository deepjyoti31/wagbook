import type { Metadata } from "next";
import { HtmlLang } from "@/components/html-lang";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { Loading } from "@/components/ui";
import { fill } from "@/lib/i18n";
import { parentI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";
import { submitIntake } from "./actions";
import { IntakeForm } from "./intake-form";

interface PublicKennel {
  name: string;
  city: string | null;
  intake_enabled: boolean;
  /** The kennel's language for parents: en, hi or kn. */
  language: string;
  notice: string;
  check_in_time: string;
  check_out_time: string;
  /** Whether the kennel delivers food, so the form asks for an address with a PIN code (M25). */
  delivers?: boolean;
}

/** The kennel behind a form link, or null. Read once per request, for the title and the page. */
const loadKennel = cache(async (slug: string): Promise<PublicKennel | null> => {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{3,40}$/i.test(slug)) return null;
  const { data, error } = await createAnonClient().rpc("get_public_intake_form", { p_slug: slug });
  if (error || !data) return null;
  return data as unknown as PublicKennel;
});

export async function generateMetadata({ params }: PageProps<"/i/[slug]">): Promise<Metadata> {
  const kennel = await loadKennel((await params).slug);
  return { title: parentI18n(kennel?.language).m.intakeForm.title, robots: { index: false } };
}

/** The public intake form for one kennel. No sign-in. */
export default function IntakePage({ params }: PageProps<"/i/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Suspense fallback={<Loading />}>
        <Intake params={params} />
      </Suspense>
    </main>
  );
}

async function Intake({ params }: Pick<PageProps<"/i/[slug]">, "params">) {
  const { slug } = await params;
  const kennel = await loadKennel(slug);
  if (!kennel) notFound();
  // Parents read this page in the language the kennel chose for them.
  const { language, m } = parentI18n(kennel.language);
  const w = m.intakeForm;

  return (
    <div lang={language}>
      <HtmlLang lang={language} />
      <h1 className="text-3xl font-extrabold tracking-tight">{kennel.name}</h1>
      <p className="mb-6 mt-2 text-lg text-slate">{w.intro}</p>
      {kennel.intake_enabled ? (
        <IntakeForm
          action={submitIntake.bind(null, slug.toLowerCase(), kennel.name, language)}
          kennelName={kennel.name}
          notice={kennel.notice}
          askAddress={kennel.delivers === true}
          words={w}
          shared={{ species: m.labels.species, sex: m.labels.sex, yes: m.common.yes, no: m.common.no, photos: m.photos, dewormedOn: m.health.dewormedOn, tickTreatedOn: m.health.tickTreatedOn }}
        />
      ) : (
        <p className="rounded-xl border border-rule bg-paper p-6 text-lg">{fill(w.closed, { kennel: kennel.name })}</p>
      )}
    </div>
  );
}
