import type { Metadata } from "next";
import { HtmlLang } from "@/components/html-lang";
import Link from "next/link";
import { Suspense } from "react";
import { Rich } from "@/components/rich";
import { buttonStyles, Loading } from "@/components/ui";
import { getVisitorI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getVisitorI18n()).m.setup.title };
}

/** Shown when the app has no database settings yet, instead of a crash. */
export default function SetupPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <Suspense fallback={<Loading />}>
        <Setup />
      </Suspense>
    </main>
  );
}

async function Setup() {
  const { m, language } = await getVisitorI18n();
  const s = m.setup;
  const ready = isSupabaseConfigured();
  const code = (name: string) => <code className="font-semibold">{name}</code>;
  return (
    <>
      <HtmlLang lang={language} />
      <h1 className="text-3xl font-extrabold tracking-tight">{ready ? s.readyTitle : s.title}</h1>
      {ready ? (
        <>
          <p className="mt-4 text-lg text-slate">{s.ready}</p>
          <Link href="/login" className={`${buttonStyles.primary} mt-6`}>
            {m.auth.signIn}
          </Link>
        </>
      ) : (
        <>
          <p className="mt-4 max-w-prose text-lg text-slate">{s.intro}</p>
          <ol className="mt-6 max-w-prose list-decimal space-y-3 pl-6 text-lg">
            <li>{s.step1}</li>
            <li>
              <Rich text={s.step2} parts={{ path: code("supabase/migrations") }} />
            </li>
            <li>
              <Rich text={s.step3} parts={{ example: code(".env.example"), local: code(".env.local") }} />
            </li>
            <li>{s.step4}</li>
          </ol>
          <p className="mt-6 max-w-prose text-slate">
            <Rich text={s.walkthrough} parts={{ path: code("docs/10-setup-and-deploy.md") }} />
          </p>
        </>
      )}
    </>
  );
}
