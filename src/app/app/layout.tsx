import Link from "next/link";
import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { OfflineSync } from "@/components/offline-sync";
import { Notice } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { IS_DEMO } from "@/lib/demo";
import { getAppI18n } from "@/lib/i18n-server";

/**
 * The signed-in shell: kennel name, navigation, and the page.
 * Everything that reads the session sits inside <Suspense>, as Next.js cache
 * components require, so the shell itself renders instantly.
 */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <div className="fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-paper p-2 sm:static sm:order-first sm:border-b sm:border-t-0">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-4">
          <Link href="/app" className="hidden text-lg font-extrabold tracking-tight sm:block">
            <Suspense fallback="Wagbook">
              <OrgName />
            </Suspense>
          </Link>
          <div className="flex-1 sm:flex-none">
            <Suspense fallback={<div className="min-h-12" />}>
              <MainNav />
            </Suspense>
          </div>
        </div>
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5 sm:pb-12">
        <Suspense fallback={null}>
          <Offline />
        </Suspense>
        {IS_DEMO ? (
          <Suspense fallback={null}>
            <DemoBanner />
          </Suspense>
        ) : null}
        {children}
      </main>
    </div>
  );
}

async function MainNav() {
  const { m, language } = await getAppI18n();
  return <Nav words={m.nav} lang={language} />;
}

async function DemoBanner() {
  const { m } = await getAppI18n();
  return (
    <div className="mb-4">
      <Notice tone="info">{m.demo.banner}</Notice>
    </div>
  );
}

async function Offline() {
  const { m, language } = await getAppI18n();
  return <OfflineSync words={m.offline} language={language} />;
}

async function OrgName() {
  const { org } = await requireOrg();
  return org.name;
}
