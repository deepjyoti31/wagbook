import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatMoney } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addRecipe } from "./actions";

export const generateMetadata = () => appTitle((m) => m.recipes.title);

export default function RecipesPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Recipes />
    </Suspense>
  );
}

async function Recipes() {
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const r = m.recipes;
  const supabase = await createClient();
  const [recipes, current] = await Promise.all([
    supabase.from("recipes").select("id, name, rotation_position, is_retired").eq("org_id", org.id).order("is_retired").order("rotation_position", { nullsFirst: false }).order("name"),
    supabase.from("recipe_current").select("recipe_id, version_id, version").eq("org_id", org.id),
  ]);
  if (recipes.error || current.error) throw new Error("Could not load recipes.");
  const versionOf = new Map(current.data.map((c) => [c.recipe_id!, c]));
  // What a kilo costs now, from the latest prices: owners and managers only (the database refuses staff).
  const costs = new Map<string, number | null>();
  if (canManage) {
    await Promise.all(
      current.data.map(async (c) => {
        const { data } = await supabase.rpc("recipe_cost_per_kg", { p_org: org.id, p_version: c.version_id! });
        costs.set(c.recipe_id!, data ?? null);
      }),
    );
  }
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });

  return (
    <>
      <PageTitle title={r.title}>
        <Link href="/app/kitchen" className={buttonStyles.quiet}>
          {m.kitchen.title}
        </Link>
      </PageTitle>
      <p className="mb-4 text-slate">{r.about}</p>
      {org.offers_kitchen ? null : <Notice tone="info">{m.kitchen.off}</Notice>}

      <Section title={r.title} count={recipes.data.length}>
        {recipes.data.length === 0 ? (
          <Empty>{r.empty}</Empty>
        ) : (
          <Ledger>
            {recipes.data.map((x) => {
              const v = versionOf.get(x.id);
              const cost = costs.get(x.id);
              return (
                <li key={x.id}>
                  <Link href={`/app/kitchen/recipes/${x.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                    <span className="flex-1">
                      <span className="block font-bold">{x.name}</span>
                      <span className="block text-sm text-slate">
                        {v ? fill(r.version, { n: v.version ?? 1 }) : r.noVersion}
                        {canManage && v ? `, ${cost != null ? fill(r.costPerKg, { amount: money(cost) }) : r.noCost}` : ""}
                      </span>
                    </span>
                    {x.is_retired ? (
                      <Badge>{r.retired}</Badge>
                    ) : x.rotation_position !== null ? (
                      <Badge tone="good">{fill(r.position, { n: x.rotation_position })}</Badge>
                    ) : (
                      <Badge>{r.notInRotation}</Badge>
                    )}
                  </Link>
                </li>
              );
            })}
          </Ledger>
        )}
      </Section>

      {canManage ? (
        <Section title={r.add}>
          <ActionForm action={addRecipe} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <Field label={r.name}>
              <Input name="name" required maxLength={80} autoComplete="off" />
            </Field>
            <Field label={r.place} hint={r.placeHint}>
              <Input name="place" inputMode="numeric" autoComplete="off" />
            </Field>
            <Field label={r.useByDays}>
              <Input name="useByDays" inputMode="numeric" defaultValue="3" required />
            </Field>
            <Field label={r.storage}>
              <Input name="storage" maxLength={200} autoComplete="off" />
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel={m.common.adding}>{r.addButton}</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
