import Link from "next/link";
import { Suspense } from "react";
import { buttonStyles, DoorTag, Loading } from "@/components/ui";
import { getVisitorI18n } from "@/lib/i18n-server";

/** The front door. Deliberately plain: it explains what Wagbook is and gets out of the way. */
export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <Suspense fallback={<Loading />}>
        <Home />
      </Suspense>
    </main>
  );
}

async function Home() {
  const { m } = await getVisitorI18n();
  const l = m.landing;
  return (
    <>
      <p className="mb-6">
        <DoorTag name={m.common.appName} empty={m.common.appName} />
      </p>
      <h1 className="text-4xl font-extrabold leading-tight tracking-tight">{l.headline}</h1>
      <p className="mt-5 max-w-prose text-lg text-slate">{l.about}</p>
      <p className="mt-3 max-w-prose text-lg text-slate">{l.free}</p>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/login" className={buttonStyles.primary}>
          {m.auth.signIn}
        </Link>
        <Link href="/login?mode=signup" className={buttonStyles.secondary}>
          {l.setUp}
        </Link>
      </div>
    </>
  );
}
