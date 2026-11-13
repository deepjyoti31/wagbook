import { Suspense, type ReactNode } from "react";
import { chooseLanguage } from "@/app/login/actions";
import { BrandMark, Icon } from "@/components/icons";
import { LANGUAGE_NAMES, LANGUAGES } from "@/lib/i18n";
import { getVisitorI18n } from "@/lib/i18n-server";

/**
 * The frame of the pages before the app (D59): signing in, a forgotten
 * password, the two-step code, setting up a kennel and joining one. On a laptop
 * the navy panel with what Wagbook is sits on the left and the form on the
 * right; on a phone the panel shrinks to a header over the form. The panel
 * ends with the languages, each named in itself.
 *
 * The page's own content comes in already wrapped in its Suspense; the panel's
 * words are read at request time too, so they have a Suspense of their own.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col md:flex-row">
      <section className="wb-dark flex flex-col gap-5 bg-ink px-5 py-6 text-paper md:min-h-dvh md:flex-[1_1_520px] md:gap-8 md:px-[clamp(24px,5vw,72px)] md:py-12">
        <p className="flex items-center gap-3">
          <BrandMark className="size-10 rounded-xl md:size-11" />
          <span className="text-xl font-extrabold tracking-[-0.01em] md:text-[22px]">Wagbook</span>
        </p>
        <Suspense fallback={null}>
          <PanelWords />
        </Suspense>
      </section>
      <div className="flex flex-1 items-start justify-center px-5 py-10 md:flex-[1_1_440px] md:items-center">
        <div className="w-full max-w-[420px]">{children}</div>
      </div>
    </main>
  );
}

async function PanelWords() {
  const { m, language } = await getVisitorI18n();
  const w = m.auth.panel;
  return (
    <>
      <h2 className="mt-auto hidden max-w-[560px] text-[40px] font-extrabold leading-[1.12] tracking-[-0.02em] text-balance md:block">{w.headline}</h2>
      <ul className="hidden max-w-[520px] flex-col gap-3.5 text-[16.5px] text-[#dfe4ee] md:flex">
        {[w.desk, w.parents, w.open].map((point) => (
          <li key={point} className="flex gap-3">
            <Icon name="check" className="mt-0.5 size-5 text-marigold" />
            {point}
          </li>
        ))}
      </ul>
      {/* Each language is a button of one small form: it works without JavaScript, and remembers the choice on this browser. */}
      <form action={chooseLanguage} aria-label={w.language} className="flex flex-wrap gap-1 md:mt-auto">
        {LANGUAGES.map((l) => (
          <button
            key={l}
            type="submit"
            name="language"
            value={l}
            lang={l}
            aria-pressed={l === language}
            className={`inline-flex min-h-11 items-center rounded-[10px] px-3 text-[15px] font-[650] ${l === language ? "bg-ink-soft text-paper" : "text-[#c9d1e0] hover:bg-ink-soft hover:text-paper"}`}
          >
            {LANGUAGE_NAMES[l]}
          </button>
        ))}
      </form>
    </>
  );
}
