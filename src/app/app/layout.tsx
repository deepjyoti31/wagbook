import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { OfflineSync } from "@/components/offline-sync";
import { requireOrg } from "@/lib/auth";
import { getAppI18n } from "@/lib/i18n-server";
import { menuFor, SIDEBAR_GROUPS } from "@/lib/menu";

/**
 * The signed-in shell: kennel name, navigation, and the page. Laptop first:
 * a sidebar on the left and a wide page beside it; on a tablet the navigation
 * is a bar along the top, and on a phone a bar along the bottom (see Nav).
 * Everything that reads the session sits inside <Suspense>, as Next.js cache
 * components require, so the shell itself renders instantly.
 */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex min-h-full flex-1 flex-col lg:flex-row">
      <div className="no-print fixed inset-x-0 bottom-0 z-10 border-t border-rule bg-paper p-2 sm:sticky sm:top-0 sm:order-first sm:border-b sm:border-t-0 sm:px-6 lg:h-dvh lg:w-60 lg:shrink-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:p-4">
        <Suspense fallback={<div className="min-h-12" />}>
          <MainNav />
        </Suspense>
      </div>
      {/* A container, so forms lay out by the room they have (a side column is narrower than the screen). */}
      <main className="@container mx-auto w-full min-w-0 max-w-7xl flex-1 px-4 pb-28 pt-5 sm:px-6 sm:pb-12 lg:px-8 lg:pt-8">
        <Suspense fallback={null}>
          <Offline />
        </Suspense>
        {children}
      </main>
    </div>
  );
}

async function MainNav() {
  const [{ org, canManage }, { m, language }] = await Promise.all([requireOrg(), getAppI18n()]);
  const links = menuFor(org, canManage);
  const groups = SIDEBAR_GROUPS.map((group) => ({
    title: m.more.groups[group],
    links: links.filter((l) => l.group === group).map((l) => ({ href: l.href, label: m.more.links[l.key].title })),
  }));
  return <Nav words={m.nav} lang={language} kennelName={org.name} calendar={m.bookings.calendar} groups={groups} />;
}

async function Offline() {
  const { m, language } = await getAppI18n();
  return <OfflineSync words={m.offline} language={language} />;
}
