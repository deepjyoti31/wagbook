import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonStyles, Ledger, Loading, PageTitle } from "@/components/ui";
import { switchOrganisation } from "@/app/app/actions";
import { getMemberships, requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { signOut } from "@/app/login/actions";

export const metadata: Metadata = { title: "More" };

const LINKS = [
  { href: "/app/bills", title: "Bills", about: "What parents owe, bills to send, and payments." },
  { href: "/app/more/reports", title: "Reports", about: "How full you were, money in and out, tax, and downloads. Owners and managers." },
  { href: "/app/more/expenses", title: "Expenses", about: "What the kennel spent, with receipts. Owners and managers." },
  { href: "/app/more/intake", title: "Forms from parents", about: "Review what parents sent, and share your intake link." },
  { href: "/app/more/kennels", title: "Kennels", about: "Add kennels and take them in or out of service." },
  { href: "/app/more/people", title: "People", about: "See who works here and invite your team." },
  { href: "/app/more/routines", title: "Daily routines", about: "Meals and other care every pet in house gets each day." },
  { href: "/app/more/play", title: "Play yards", about: "Yards, play hours, and how many yards you need." },
  { href: "/app/more/extras", title: "Extras", about: "Grooming, pick-up and anything else you charge for." },
  { href: "/app/more/peak", title: "Peak periods", about: "Festivals and long weekends, with your no-refund rule." },
  { href: "/app/more/settings", title: "Settings", about: "Kennel details, prices, tax and UPI." },
  { href: "/app/more/history", title: "History of changes", about: "Who changed what, and when. Owners and managers." },
] as const;

export default function MorePage() {
  return (
    <>
      <PageTitle title="More" />
      <Ledger>
        {LINKS.map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block px-4 py-4 hover:bg-ground">
              <span className="block text-lg font-bold">{l.title}</span>
              <span className="block text-slate">{l.about}</span>
            </Link>
          </li>
        ))}
      </Ledger>
      <div className="mt-8">
        <Suspense fallback={<Loading />}>
          <Account />
        </Suspense>
      </div>
    </>
  );
}

async function Account() {
  const { user, org, role, displayName } = await requireOrg();
  const invitations = (await (await createClient()).rpc("my_invitations")).data ?? [];
  const others = (await getMemberships()).filter((m) => m.organizations!.id !== org.id);
  return (
    <>
      <p className="text-slate">
        Signed in as {displayName} ({user.email ?? "no email"}), {role} at {org.name}.
      </p>
      {invitations.length > 0 ? (
        <p className="mt-4">
          <Link href="/onboarding" className="font-semibold underline underline-offset-4">
            You have {invitations.length === 1 ? "an invitation" : `${invitations.length} invitations`} to another kennel
          </Link>
        </p>
      ) : null}
      {others.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 font-semibold">You also work at</p>
          <div className="flex flex-wrap gap-2">
            {others.map((m) => (
              <form key={m.organizations!.id} action={switchOrganisation}>
                <input type="hidden" name="orgId" value={m.organizations!.id} />
                <button type="submit" className={buttonStyles.secondary}>
                  Switch to {m.organizations!.name}
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : null}
      <form action={signOut} className="mt-3">
        <button type="submit" className={buttonStyles.secondary}>
          Sign out
        </button>
      </form>
    </>
  );
}
