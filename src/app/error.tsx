"use client";

import { useSyncExternalStore } from "react";
import { buttonStyles } from "@/components/ui";
import { isLanguage, type Language } from "@/lib/i18n";

/**
 * This page cannot read the message files (it runs in the browser and must
 * work when everything else has failed), so it keeps its own three sentences.
 * Hindi and Kannada are drafts, like the message files.
 */
const WORDS: Record<Language, { title: string; text: string; retry: string }> = {
  en: { title: "That did not load", text: "Nothing was changed. Check your connection and try again.", retry: "Try again" },
  hi: { title: "यह खुल नहीं पाया", text: "कुछ भी नहीं बदला। इंटरनेट देखें और फिर से कोशिश करें।", retry: "फिर से कोशिश करें" },
  kn: { title: "ಇದು ತೆರೆಯಲಿಲ್ಲ", text: "ಏನೂ ಬದಲಾಗಿಲ್ಲ. ಸಂಪರ್ಕ ನೋಡಿ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.", retry: "ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ" },
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
