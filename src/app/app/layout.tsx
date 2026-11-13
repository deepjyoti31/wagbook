import { Suspense } from "react";
import { Nav } from "@/components/nav";
import { OfflineSync } from "@/components/offline-sync";
import { requireOrg } from "@/lib/auth";
import { localClock, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { getAppI18n } from "@/lib/i18n-server";
import { menuFor, SIDEBAR_GROUPS } from "@/lib/menu";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in shell: kennel name, navigation, and the page. Laptop first:
 * a dark sidebar on the left and a wide page beside it; on a tablet the
 * navigation is a bar along the top, and on a phone the kennel's name is at
 * the top and the links are along the bottom (see Nav).
 * Everything that reads the session sits inside <Suspense>, as Next.js cache
 * components require, so the shell itself renders instantly.
 */
export default function AppLayout({ children }: LayoutProps<"/app">) {
  return (
    <div className="flex min-h-full flex-1 flex-col bg-ground lg:flex-row">
      <Suspense fallback={<div className="no-print hidden w-[260px] shrink-0 bg-ink lg:block" />}>
        <MainNav />
      </Suspense>
      {/* A container, so forms lay out by the room they have (a side column is narrower than the screen). */}
      <main className="wb-main @container mx-auto w-full min-w-0 max-w-[1380px] flex-1 px-4 pb-24 pt-[18px] sm:px-6 sm:pb-10 sm:pt-6 lg:px-[clamp(16px,3vw,40px)] lg:pb-14 lg:pt-7">
        <Suspense fallback={null}>
          <Offline />
        </Suspense>
        {children}
      </main>
    </div>
  );
}

async function MainNav() {
  const [{ org, user, canManage, role, displayName }, { m, language }] = await Promise.all([requireOrg(), getAppI18n()]);
  const links = menuFor(org, canManage);
  const groups = SIDEBAR_GROUPS.map((group) => ({
    title: m.more.groups[group],
    // The sidebar is narrow: the history has a shorter name there.
    links: links.filter((l) => l.group === group).map((l) => ({ href: l.href, label: l.key === "history" ? m.nav.history : m.more.links[l.key].title })),
  }));
  const supabase = await createClient();
  const today = todayIn(org.time_zone);
  // What is waiting, shown beside its link: stays parents asked for, care still to do today, and new forms.
  const [requests, care, forms, shift] = await Promise.all([
    supabase.from("bookings").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "requested").eq("source", "parent").gte("end_date", today),
    supabase.from("care_tasks").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("task_date", today).eq("status", "pending"),
    supabase.from("intake_submissions").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "new"),
    org.keeps_rota
      ? supabase.from("attendance").select("clocked_in_at").eq("org_id", org.id).eq("user_id", user.id).is("clocked_out_at", null).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);
  const roleName = m.labels.role[role];
  return (
    <Nav
      words={m.nav}
      lang={language}
      kennelName={org.name}
      calendar={m.bookings.calendar}
      groups={groups}
      search={{ label: m.bookings.search, placeholder: m.nav.find }}
      person={{
        name: displayName || org.name,
        role: shift.data ? fill(m.nav.onShift, { role: roleName, time: localClock(shift.data.clocked_in_at, org.time_zone) }) : roleName,
      }}
      counts={{ "/app/bookings": requests.count ?? 0, "/app/care": care.count ?? 0, "/app/more/intake": forms.count ?? 0 }}
    />
  );
}

async function Offline() {
  const { m, language } = await getAppI18n();
  return <OfflineSync words={m.offline} language={language} />;
}
