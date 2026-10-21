import Link from "next/link";
import { Suspense } from "react";
import { PrintButton } from "@/components/print-button";
import { buttonStyles, Empty, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { addDays, formatDate, isISODate, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.kitchen.links.labels);

export default function LabelsPage({ searchParams }: PageProps<"/app/kitchen/labels">) {
  return (
    <Suspense fallback={<Loading />}>
      <Labels searchParams={searchParams} />
    </Suspense>
  );
}

/** One label for each pack of each packed delivery on a day: pet, recipe, grams, batch, dates and how to store it. A4 to print and cut. */
async function Labels({ searchParams }: Pick<PageProps<"/app/kitchen/labels">, "searchParams">) {
  const asked = (await searchParams).date;
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const w = m.packLabels;
  const day = typeof asked === "string" && isISODate(asked) ? asked : addDays(todayIn(org.time_zone), 1);
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("deliveries")
    .select("id, grams, packs, pets(name), recipes(name, storage_note), batches(number, cooked_on, use_by)")
    .eq("org_id", org.id)
    .eq("delivery_date", day)
    .in("status", ["packed", "out", "delivered"])
    .not("batch_id", "is", null)
    .order("created_at");
  if (error) throw new Error("Could not load labels.");
  const labels = data.flatMap((d) =>
    Array.from({ length: d.packs }, (_, i) => ({
      key: `${d.id}-${i}`,
      pet: d.pets?.name ?? "",
      recipe: d.recipes?.name ?? "",
      store: d.recipes?.storage_note ?? w.store,
      grams: i < d.packs - 1 ? org.food_pack_g : d.grams - (d.packs - 1) * org.food_pack_g,
      n: i + 1,
      total: d.packs,
      batch: d.batches?.number ?? "",
      cooked: d.batches?.cooked_on ?? day,
      useBy: d.batches?.use_by ?? day,
    })),
  );

  return (
    <>
      <div className="no-print">
        <PageTitle title={fill(w.title, { date: formatDate(day, locale) })}>
          <Link href={`/app/kitchen?date=${day}`} className={buttonStyles.quiet}>
            {m.kitchen.title}
          </Link>
          {labels.length > 0 ? <PrintButton label={m.common.print} /> : null}
        </PageTitle>
        <p className="mb-4 text-slate">{w.about}</p>
      </div>
      {labels.length === 0 ? (
        <Empty>{w.none}</Empty>
      ) : (
        <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2 print:grid-cols-2">
          {labels.map((l) => (
            <li key={l.key} className="break-inside-avoid rounded-lg border-2 border-dashed border-ink bg-paper p-3">
              <p className="text-lg font-extrabold">{fill(w.pet, { pet: l.pet })}</p>
              <p className="font-bold">
                {l.recipe}, {fill(w.grams, { grams: l.grams })}
              </p>
              <p>{fill(w.batch, { number: l.batch })}</p>
              <p>
                {fill(w.cookedOn, { date: formatDate(l.cooked, locale) })}. <strong>{fill(w.useBy, { date: formatDate(l.useBy, locale) })}</strong>
              </p>
              <p className="text-sm">{l.store}</p>
              <p className="text-sm text-slate">
                {org.name}. {fill(w.packOf, { n: l.n, total: l.total })}
              </p>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
