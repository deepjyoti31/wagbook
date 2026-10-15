import Link from "next/link";
import { HtmlLang } from "@/components/html-lang";
import { Suspense } from "react";
import { buttonStyles, Loading } from "@/components/ui";
import { getVisitorI18n } from "@/lib/i18n-server";

export default function NotFound() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <Suspense fallback={<Loading />}>
        <Words />
      </Suspense>
    </main>
  );
}

async function Words() {
  const { m, language } = await getVisitorI18n();
  return (
    <>
      <HtmlLang lang={language} />
      <h1 className="text-3xl font-extrabold tracking-tight">{m.notFound.title}</h1>
      <p className="mt-3 text-lg text-slate">{m.notFound.text}</p>
      <Link href="/" className={`${buttonStyles.secondary} mt-6`}>
        {m.notFound.start}
      </Link>
    </>
  );
}
