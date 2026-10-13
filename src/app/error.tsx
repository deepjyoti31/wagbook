"use client";

import { buttonStyles } from "@/components/ui";

/** Shown when a page fails to load. The real error is in the server logs, never on screen. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">That did not load</h1>
      <p className="mt-3 text-lg text-slate">Nothing was changed. Check your connection and try again.</p>
      <button type="button" onClick={reset} className={`${buttonStyles.primary} mt-6`}>
        Try again
      </button>
    </main>
  );
}
