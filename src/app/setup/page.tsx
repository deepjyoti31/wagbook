import type { Metadata } from "next";
import Link from "next/link";
import { buttonStyles } from "@/components/ui";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata: Metadata = { title: "Connect a database" };

/** Shown when the app has no database settings yet, instead of a crash. */
export default function SetupPage() {
  const ready = isSupabaseConfigured();
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{ready ? "Database settings are in place" : "Connect a database"}</h1>
      {ready ? (
        <>
          <p className="mt-4 text-lg text-slate">This copy of Wagbook knows where its Supabase project is. Try signing in; if that fails, check the URL and key in your environment settings.</p>
          <Link href="/login" className={`${buttonStyles.primary} mt-6`}>
            Sign in
          </Link>
        </>
      ) : (
        <>
          <p className="mt-4 max-w-prose text-lg text-slate">
            Wagbook stores everything in a Supabase project that you own. This copy has not been told where that project is yet.
          </p>
          <ol className="mt-6 max-w-prose list-decimal space-y-3 pl-6 text-lg">
            <li>Create a free project at supabase.com. Choose the Mumbai region if your kennel is in India.</li>
            <li>
              Apply the database migrations in <code className="font-semibold">supabase/migrations</code>.
            </li>
            <li>
              Copy <code className="font-semibold">.env.example</code> to <code className="font-semibold">.env.local</code> and fill in the
              project URL and publishable key.
            </li>
            <li>Restart the app.</li>
          </ol>
          <p className="mt-6 max-w-prose text-slate">
            The full walkthrough is in <code className="font-semibold">docs/10-setup-and-deploy.md</code>.
          </p>
        </>
      )}
    </main>
  );
}
