"use client";

import { useSyncExternalStore } from "react";
import { buttonStyles } from "@/components/ui";
import { isLanguage, type Language } from "@/lib/i18n";

/**
 * This page cannot read the message files (it runs in the browser and must
 * work when everything else has failed), so it keeps its own three sentences.
 * TODO(M8): Hindi and Kannada are English until they are translated.
 */
const WORDS: Record<Language, { title: string; text: string; retry: string }> = {
  en: { title: "That did not load", text: "Nothing was changed. Check your connection and try again.", retry: "Try again" },
  hi: { title: "That did not load", text: "Nothing was changed. Check your connection and try again.", retry: "Try again" },
  kn: { title: "That did not load", text: "Nothing was changed. Check your connection and try again.", retry: "Try again" },
};

/** The language the page around it was drawn in (the signed-in screens set it), or English. */
function usePageLanguage(): Language {
  const lang = useSyncExternalStore(
    () => () => {},
    () => document.documentElement.lang,
    () => "en",
  );
  return isLanguage(lang) ? lang : "en";
}

/** Shown when a page fails to load. The real error is in the server logs, never on screen. */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const w = WORDS[usePageLanguage()];
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-5 py-12">
      <h1 className="text-3xl font-extrabold tracking-tight">{w.title}</h1>
      <p className="mt-3 text-lg text-slate">{w.text}</p>
      <button type="button" onClick={reset} className={`${buttonStyles.primary} mt-6`}>
        {w.retry}
      </button>
    </main>
  );
}
