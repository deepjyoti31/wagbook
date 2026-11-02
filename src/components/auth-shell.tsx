import { Suspense, type ReactNode } from "react";
import { BrandMark } from "@/components/icons";
import { getVisitorI18n } from "@/lib/i18n-server";

/**
 * The frame of the pages before the app (D59): signing in, a forgotten
 * password, the two-step code, setting up a kennel and joining one. On a laptop
 * the navy panel with what Wagbook is sits on the left and the form on the
 * right; on a phone the panel shrinks to a header over the form.
 *
 * The page's own content comes in already wrapped in its Suspense; the panel's
 * words are read at request time too, so they have a Suspense of their own.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="flex flex-1 flex-col md:flex-row">
      <section className="wb-dark flex flex-col gap-6 bg-ink px-5 py-6 text-paper md:min-h-dvh md:flex-[1_1_50%] md:gap-10 md:px-[clamp(2rem,5vw,4.5rem)] md:py-12">
        <p className="flex items-center gap-3">
          <BrandMark className="size-10 md:size-11" />
          <span className="text-xl font-extrabold tracking-tight md:text-[1.375rem]">Wagbook</span>
        </p>
        <Suspense fallback={null}>
          <PanelWords />
        </Suspense>
      </section>
      <div className="flex flex-1 items-start justify-center px-5 py-10 md:flex-[1_1_45%] md:items-center md:py-12">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </main>
  );
}

async function PanelWords() {
  const { m } = await getVisitorI18n();
  return (
    <div className="hidden max-w-xl md:mt-auto md:block">
      <p className="text-[2.25rem] font-extrabold leading-tight tracking-tight text-balance lg:text-[2.5rem]">{m.landing.headline}</p>
      <p className="mt-5 text-lg text-paper/80">{m.landing.about}</p>
      <p className="mt-3 text-lg text-paper/80">{m.landing.free}</p>
    </div>
  );
}
