import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { cache, Suspense } from "react";
import { HtmlLang } from "@/components/html-lang";
import { Loading } from "@/components/ui";
import type { PortionSettings } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { parentI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createAnonClient } from "@/lib/supabase/server";
import { saidPaid, submitFoodOrder } from "./actions";
import { FoodOrderForm } from "./order-form";

interface PublicFood {
  kennel: {
    name: string;
    whatsapp_phone: string | null;
    language: string;
    locale: string;
    currency: string;
    country_code: string;
    upi_vpa: string | null;
    upi_payee_name: string;
    notice: string;
  };
  pack_g: number;
  portions: PortionSettings;
  trial: { name: string; price_minor: number; grams: number } | null;
  subscription: { name: string; price_per_kg_minor: number } | null;
  areas: { postal_code: string; name: string; charge_minor: number }[];
}

/** The kennel behind a food order link, or null. Read once per request, for the title and the page. */
const loadFood = cache(async (slug: string): Promise<PublicFood | null> => {
  if (!isSupabaseConfigured() || !/^[a-z0-9-]{3,40}$/i.test(slug)) return null;
  const { data, error } = await createAnonClient().rpc("get_public_food_form", { p_slug: slug });
  if (error || !data) return null;
  return data as unknown as PublicFood;
});

export async function generateMetadata({ params }: PageProps<"/f/[slug]">): Promise<Metadata> {
  const food = await loadFood((await params).slug);
  const { m } = parentI18n(food?.kennel.language);
  return { title: fill(m.foodOrder.title, { kennel: food?.kennel.name ?? "" }), robots: { index: false } };
}

/** The public food order page for one kennel (M32): a link it can put on its own website. No sign-in. */
export default function FoodOrderPage({ params }: PageProps<"/f/[slug]">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-8">
      <Suspense fallback={<Loading />}>
        <FoodOrder params={params} />
      </Suspense>
    </main>
  );
}

async function FoodOrder({ params }: Pick<PageProps<"/f/[slug]">, "params">) {
  const { slug } = await params;
  const food = await loadFood(slug);
  if (!food) notFound();
  // Parents read this page in the language the kennel chose for them.
  const { language, m, locale } = parentI18n(food.kennel.language, food.kennel.locale);
  const w = m.foodOrder;
  const k = food.kennel;
  const open = food.trial !== null || food.subscription !== null;

  return (
    <div lang={language}>
      <HtmlLang lang={language} />
      <h1 className="text-3xl font-extrabold tracking-tight">{fill(w.title, { kennel: k.name })}</h1>
      <p className="mb-6 mt-2 text-lg text-slate">{w.intro}</p>
      {open ? (
        <FoodOrderForm
          send={submitFoodOrder.bind(null, slug.toLowerCase(), language, {
            vpa: k.upi_vpa,
            payeeName: k.upi_payee_name,
            currency: k.currency,
            locale,
            kennelName: k.name,
            country: k.country_code,
          })}
          paid={saidPaid.bind(null, language)}
          form={{
            currency: k.currency,
            locale,
            countryCode: k.country_code,
            packG: food.pack_g,
            portions: food.portions,
            trial: food.trial,
            subscription: food.subscription,
            areas: food.areas,
          }}
          kennelName={k.name}
          notice={k.notice}
          words={w}
          shared={{ slots: m.slots, weekdays: m.weekdays, bands: m.bands }}
        />
      ) : (
        <p className="rounded-xl border border-rule bg-paper p-6 text-lg">{w.closed}</p>
      )}
    </div>
  );
}
