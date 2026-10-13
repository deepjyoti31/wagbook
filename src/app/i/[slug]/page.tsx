import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Loading } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";
import { submitIntake } from "./actions";
import { IntakeForm } from "./intake-form";

export const metadata: Metadata = { title: "Tell us about your pet", robots: { index: false } };

interface PublicKennel {
  name: string;
  city: string | null;
  intake_enabled: boolean;
  notice: string;
  check_in_time: string;
  check_out_time: string;
}

/** The public intake form for one kennel. No sign-in. */
export default function IntakePage({ params }: PageProps<"/i/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Suspense fallback={<Loading label="Loading the form" />}>
        <Intake params={params} />
      </Suspense>
    </main>
  );
}

async function Intake({ params }: Pick<PageProps<"/i/[slug]">, "params">) {
  const { slug } = await params;
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{3,40}$/i.test(slug)) notFound();

  const { data, error } = await createAnonClient().rpc("get_public_intake_form", { p_slug: slug });
  if (error || !data) notFound();
  const kennel = data as unknown as PublicKennel;

  return (
    <>
      <h1 className="text-3xl font-extrabold tracking-tight">{kennel.name}</h1>
      <p className="mb-6 mt-2 text-lg text-slate">
        Tell us about your pet before the stay, so we can look after them the way you do. It takes about three minutes.
      </p>
      {kennel.intake_enabled ? (
        <IntakeForm action={submitIntake.bind(null, slug.toLowerCase())} kennelName={kennel.name} notice={kennel.notice} />
      ) : (
        <p className="rounded-xl border border-rule bg-paper p-6 text-lg">
          {kennel.name} is not taking details through this form at the moment. Please contact them directly.
        </p>
      )}
    </>
  );
}
