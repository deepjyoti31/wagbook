import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select, Textarea } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatMoney } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { quantityText } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import { saveVersion, updateRecipe } from "../actions";

export const generateMetadata = () => appTitle((m) => m.recipes.title);

export default function RecipePage({ params, searchParams }: PageProps<"/app/kitchen/recipes/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Recipe params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Recipe({ params, searchParams }: Pick<PageProps<"/app/kitchen/recipes/[id]">, "params" | "searchParams">) {
  const { id } = await params;
  const done = (await searchParams).done;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale, language } = t;
  const r = m.recipes;
  const w = m.recipePage;
  const supabase = await createClient();
  const [recipe, versions, items, batches] = await Promise.all([
    supabase.from("recipes").select("id, name, rotation_position, use_by_days, storage_note, is_retired").eq("org_id", org.id).eq("id", id).maybeSingle(),
    supabase
      .from("recipe_versions")
      .select("id, version, good_for, cooked_yield_bp, kcal_per_kg, protein_g_per_kg, signed_off_by, signed_off_on, lab_tested_on, created_at, recipe_ingredients(item_id, quantity_per_kg)")
      .eq("org_id", org.id)
      .eq("recipe_id", id)
      .order("version", { ascending: false }),
    supabase.from("stock_items").select("id, name, unit, never_in_recipe, is_active").eq("org_id", org.id).order("name"),
    supabase.from("batches").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("recipe_id", id),
  ]);
  if (recipe.error || versions.error || items.error) throw new Error("Could not load the recipe.");
  if (!recipe.data) notFound();
  const x = recipe.data;
  const itemOf = new Map(items.data.map((i) => [i.id, i]));
  const [current, ...earlier] = versions.data;
  const cost = canManage && current ? (await supabase.rpc("recipe_cost_per_kg", { p_org: org.id, p_version: current.id })).data : null;
  const usable = items.data.filter((i) => i.is_active && !i.never_in_recipe);
  const rows = [...(current?.recipe_ingredients ?? []), ...Array.from({ length: 4 }, () => null)];

  const ingredientList = (v: NonNullable<typeof current>) => (
    <ul className="list-inside list-disc">
      {v.recipe_ingredients.map((ri) => {
        const item = itemOf.get(ri.item_id);
        return <li key={ri.item_id}>{fill(w.ingredientLine, { item: item?.name ?? "", quantity: quantityText(ri.quantity_per_kg, item?.unit ?? "g", locale) })}</li>;
      })}
    </ul>
  );

  return (
    <>
      <PageTitle title={x.name}>
        <Link href="/app/kitchen/recipes" className={buttonStyles.quiet}>
          {r.title}
        </Link>
      </PageTitle>
      {done === "added" ? <Notice tone="ok">{fill(r.added, { name: x.name })}</Notice> : null}
      <p className="mb-4 flex flex-wrap items-center gap-2">
        {x.is_retired ? <Badge>{r.retired}</Badge> : x.rotation_position !== null ? <Badge tone="good">{fill(r.position, { n: x.rotation_position })}</Badge> : <Badge>{r.notInRotation}</Badge>}
        {current ? <Badge>{fill(r.version, { n: current.version })}</Badge> : null}
        <span className="text-slate">{plural(language, batches.count ?? 0, w.cooked)}</span>
      </p>

      {current ? (
        <Section title={w.ingredients}>
          <div className="space-y-2 rounded-xl border border-rule bg-paper p-4">
            {ingredientList(current)}
            {current.good_for ? <p>{`${w.goodFor}: ${current.good_for}`}</p> : null}
            {current.kcal_per_kg !== null && current.protein_g_per_kg !== null ? (
              <p className="text-slate">{fill(w.nutrition, { kcal: current.kcal_per_kg, protein: current.protein_g_per_kg })}</p>
            ) : null}
            <p className="text-slate">
              {current.signed_off_by && current.signed_off_on
                ? fill(w.signedOff, { who: current.signed_off_by, date: formatDate(current.signed_off_on, locale) })
                : w.notSignedOff}
            </p>
            {current.lab_tested_on ? <p className="text-slate">{fill(w.labTested, { date: formatDate(current.lab_tested_on, locale) })}</p> : null}
            {canManage ? (
              <p className="font-semibold">{cost != null ? fill(r.costPerKg, { amount: formatMoney(cost, { currency: org.currency, locale, trimZeros: true }) }) : r.noCost}</p>
            ) : null}
          </div>
        </Section>
      ) : (
        <Empty>{r.noVersion}</Empty>
      )}

      {canManage && !x.is_retired ? (
        <Section title={w.newVersion}>
          <ActionForm action={saveVersion} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <input type="hidden" name="recipeId" value={x.id} />
            <p className="text-sm text-slate">{w.newVersionAbout}</p>
            {rows.map((row, i) => (
              <div key={i} className="grid gap-3 sm:grid-cols-2">
                <Field label={w.item}>
                  <Select name={`item_${i}`} defaultValue={row?.item_id ?? ""}>
                    <option value="">{m.common.none}</option>
                    {usable.map((it) => (
                      <option key={it.id} value={it.id}>
                        {it.name} ({m.units[it.unit]})
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label={w.perKg}>
                  <Input
                    name={`qty_${i}`}
                    autoComplete="off"
                    defaultValue={row ? quantityText(row.quantity_per_kg, itemOf.get(row.item_id)?.unit ?? "g", "en-IN").replace(/,/g, "") : ""}
                  />
                </Field>
              </div>
            ))}
            <p className="text-sm text-slate">{w.addRow}</p>
            <Field label={w.goodForField}>
              <Textarea name="goodFor" rows={2} maxLength={500} defaultValue={current?.good_for ?? ""} />
            </Field>
            <div className="grid gap-3 sm:grid-cols-3">
              <Field label={w.yieldField}>
                <Input name="yieldG" inputMode="numeric" defaultValue={current?.cooked_yield_bp ? String(current.cooked_yield_bp / 10) : ""} />
              </Field>
              <Field label={w.kcalField}>
                <Input name="kcal" inputMode="numeric" defaultValue={current?.kcal_per_kg ?? ""} />
              </Field>
              <Field label={w.proteinField}>
                <Input name="protein" inputMode="numeric" defaultValue={current?.protein_g_per_kg ?? ""} />
              </Field>
              <Field label={w.signedOffBy}>
                <Input name="signedOffBy" maxLength={120} defaultValue={current?.signed_off_by ?? ""} />
              </Field>
              <Field label={w.signedOffOn}>
                <Input name="signedOffOn" type="date" defaultValue={current?.signed_off_on ?? ""} />
              </Field>
              <Field label={w.labTestedOn}>
                <Input name="labTestedOn" type="date" defaultValue={current?.lab_tested_on ?? ""} />
              </Field>
            </div>
            <SubmitButton pendingLabel={m.common.saving}>{w.saveVersion}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      {canManage && !x.is_retired ? (
        <Section title={w.settings}>
          <ActionForm action={updateRecipe} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
            <input type="hidden" name="recipeId" value={x.id} />
            <Field label={r.place} hint={r.placeHint}>
              <Input name="place" inputMode="numeric" defaultValue={x.rotation_position ?? ""} />
            </Field>
            <Field label={r.useByDays}>
              <Input name="useByDays" inputMode="numeric" defaultValue={x.use_by_days} required />
            </Field>
            <Field label={r.storage}>
              <Input name="storage" maxLength={200} defaultValue={x.storage_note ?? ""} />
            </Field>
            <div className="flex flex-wrap gap-2 sm:col-span-3">
              <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                {m.common.saveChanges}
              </SubmitButton>
              <SubmitButton variant="quiet" name="intent" value="retire" pendingLabel={m.common.saving}>
                {w.retire}
              </SubmitButton>
            </div>
            <p className="text-sm text-slate sm:col-span-3">{w.retireHint}</p>
          </ActionForm>
        </Section>
      ) : null}

      {earlier.length > 0 ? (
        <Section title={w.versions} count={earlier.length}>
          <ul className="space-y-3">
            {earlier.map((v) => (
              <li key={v.id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="mb-1 font-bold">{fill(r.version, { n: v.version })}</p>
                {ingredientList(v)}
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}
