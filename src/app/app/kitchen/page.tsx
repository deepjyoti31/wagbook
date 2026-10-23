import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, buttonStyles, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import {
  addDays,
  boarderRecipeIndex,
  cookPlan,
  dailyGrams,
  formatDate,
  formatKg,
  isISODate,
  shoppingList,
  todayIn,
  whatsappLink,
} from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { percentText, planAhead, portionSettings, quantityText } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import { packAll, packDelivery, recordBatch } from "./actions";

export const generateMetadata = () => appTitle((m) => m.kitchen.title);

export default function KitchenPage({ searchParams }: PageProps<"/app/kitchen">) {
  return (
    <Suspense fallback={<Loading />}>
      <Kitchen searchParams={searchParams} />
    </Suspense>
  );
}

async function Kitchen({ searchParams }: Pick<PageProps<"/app/kitchen">, "searchParams">) {
  const asked = (await searchParams).date;
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale, language } = t;
  const k = m.kitchen;
  const today = todayIn(org.time_zone);
  const day = typeof asked === "string" && isISODate(asked) ? asked : addDays(today, 1);
  const supabase = await createClient();
  await planAhead(supabase, org);

  const [deliveries, stays, recipes, batches, members, levels] = await Promise.all([
    supabase
      .from("deliveries")
      .select("id, kind, status, slot, grams, packs, quantity, recipe_id, batch_id, pets(name), clients(full_name)")
      .eq("org_id", org.id)
      .eq("delivery_date", day)
      .neq("status", "cancelled")
      .order("slot")
      .order("created_at"),
    supabase
      .from("bookings")
      .select("pet_id, kind, start_date, end_date, pets(name, weight_g)")
      .eq("org_id", org.id)
      .in("status", ["confirmed", "checked_in"])
      .lte("start_date", day)
      .gte("end_date", day),
    supabase.from("recipe_current").select("recipe_id, version_id, name, rotation_position, is_retired").eq("org_id", org.id),
    supabase.from("batches").select("id, number, recipe_id, cooked_on, use_by, grams, packs, recipes(name)").eq("org_id", org.id).order("cooked_on", { ascending: false }).order("number", { ascending: false }).limit(30),
    supabase.from("memberships").select("user_id, display_name, skills, role").eq("org_id", org.id).eq("is_active", true).order("display_name"),
    supabase.from("stock_levels").select("item_id, name, unit, supplier_id, on_hand").eq("org_id", org.id),
  ]);
  if (deliveries.error || stays.error || recipes.error || batches.error || members.error || levels.error) throw new Error("Could not load the kitchen.");

  // Boarders in house that day: a boarding stay's nights, and day boarding on its day.
  const batchNumber = new Map(batches.data.map((b) => [b.id, b.number]));
  const packedFrom = (id: string | null) => (id ? batchNumber.get(id) : undefined);
  const boarders = stays.data.filter((b) => (b.kind === "daycare" ? true : b.end_date > day));
  const petIds = [...new Set(boarders.map((b) => b.pet_id))];
  const food = petIds.length > 0 ? await supabase.from("pet_food").select("pet_id, plan, goal, grams_by_hand, boarder_food").eq("org_id", org.id).in("pet_id", petIds) : { data: [], error: null };
  if (food.error) throw new Error("Could not load the kitchen.");
  const foodOf = new Map(food.data.map((f) => [f.pet_id, f]));
  const rotation = recipes.data
    .filter((r) => r.rotation_position !== null && !r.is_retired)
    .sort((a, b) => (a.rotation_position ?? 0) - (b.rotation_position ?? 0));
  const boarderRecipe = rotation[boarderRecipeIndex(day, rotation.length)] ?? null;
  const settings = portionSettings(org);
  const onKitchen = boarders.filter((b) => (foodOf.get(b.pet_id)?.boarder_food ?? "kitchen") === "kitchen");
  const unweighed = onKitchen.filter((b) => dailyGrams({ weight_g: b.pets?.weight_g ?? null }, foodOf.get(b.pet_id) ?? null, settings) === null);
  const plan = cookPlan(
    deliveries.data.filter((d) => d.kind !== "item"),
    onKitchen.map((b) => ({
      recipe_id: boarderRecipe?.recipe_id ?? null,
      grams: dailyGrams({ weight_g: b.pets?.weight_g ?? null }, foodOf.get(b.pet_id) ?? null, settings) ?? 0,
    })),
    org.cook_margin_bp,
  );
  const recipeOf = new Map(recipes.data.map((r) => [r.recipe_id!, r]));
  const kg = (g: number) => `${formatKg(g, locale)} kg`;

  // The shopping list for the plan.
  const versions = plan.map((p) => ({ version_id: recipeOf.get(p.recipe_id)?.version_id ?? "", grams: p.cook })).filter((p) => p.version_id);
  const ingredients =
    versions.length > 0
      ? await supabase.from("recipe_ingredients").select("version_id, item_id, quantity_per_kg").eq("org_id", org.id).in("version_id", versions.map((v) => v.version_id))
      : { data: [], error: null };
  const suppliers = await supabase.from("suppliers").select("id, name, phone").eq("org_id", org.id);
  const list = shoppingList(
    versions,
    ingredients.data ?? [],
    levels.data.map((l) => ({ item_id: l.item_id!, name: l.name!, unit: l.unit!, supplier_id: l.supplier_id, on_hand: l.on_hand ?? 0 })),
  );
  const bySupplier = new Map<string | null, typeof list>();
  for (const line of list) bySupplier.set(line.supplier_id, [...(bySupplier.get(line.supplier_id) ?? []), line]);
  const supplierOf = new Map((suppliers.data ?? []).map((s) => [s.id, s]));

  const cooks = members.data.filter((x) => x.role !== "rider");
  const usable = (recipeId: string | null) => batches.data.filter((b) => b.recipe_id === recipeId && b.cooked_on <= day && b.use_by >= day);
  const toPack = deliveries.data.filter((d) => d.status === "planned").length;
  const dates = [today, addDays(today, 1), addDays(today, 2)];

  return (
    <>
      <PageTitle title={k.title} />
      {org.offers_kitchen ? null : <Notice tone="info">{k.off}</Notice>}
      <nav className="mb-5 flex flex-wrap gap-2">
        <Link href="/app/kitchen/stock" className={buttonStyles.secondary}>
          {k.links.stock}
        </Link>
        <Link href="/app/kitchen/recipes" className={buttonStyles.secondary}>
          {k.links.recipes}
        </Link>
        <Link href={`/app/kitchen/labels?date=${day}`} className={buttonStyles.secondary}>
          {k.links.labels}
        </Link>
        <Link href="/app/kitchen/settings" className={buttonStyles.quiet}>
          {k.links.settings}
        </Link>
      </nav>

      <form className="mb-6 flex flex-wrap items-end gap-2" action="/app/kitchen">
        <div className="min-w-48 flex-1">
          <Field label={k.forDay}>
            <Input type="date" name="date" defaultValue={day} required />
          </Field>
        </div>
        <button type="submit" className={buttonStyles.secondary}>
          {k.show}
        </button>
        {dates.map((d) => (
          <Link key={d} href={`/app/kitchen?date=${d}`} className={buttonStyles.quiet} aria-current={d === day ? "date" : undefined}>
            {formatDate(d, locale)}
          </Link>
        ))}
      </form>

      <Section title={k.plan}>
        <p className="mb-2 text-sm text-slate">{fill(k.planAbout, { date: formatDate(day, locale), margin: `${percentText(org.cook_margin_bp)}%` })}</p>
        {plan.length === 0 ? (
          <Empty>{k.planEmpty}</Empty>
        ) : (
          <Ledger>
            {plan.map((p) => (
              <LedgerRow key={p.recipe_id}>
                <div className="flex-1">
                  <p className="text-lg font-bold">{fill(k.planLine, { recipe: recipeOf.get(p.recipe_id)?.name ?? k.noRecipe, cook: kg(p.cook) })}</p>
                  <p className="text-sm text-slate">{fill(k.planParts, { deliveries: kg(p.deliveries), boarders: kg(p.boarders) })}</p>
                </div>
              </LedgerRow>
            ))}
          </Ledger>
        )}
        {onKitchen.length > 0 ? (
          <p className="mt-2 text-slate">{fill(k.boardersToday, { count: onKitchen.length, recipe: boarderRecipe?.name ?? k.noRecipe })}</p>
        ) : null}
        {deliveries.data.some((d) => d.kind !== "item" && !d.recipe_id) ? <p className="mt-2 font-semibold text-alert">{k.noRecipe}</p> : null}
        {unweighed.map((b) => (
          <p key={b.pet_id} className="mt-1 text-sm text-alert">
            {fill(k.noWeight, { pet: b.pets?.name ?? "" })}
          </p>
        ))}
      </Section>

      <Section title={k.shopping}>
        <p className="mb-2 text-sm text-slate">{k.shoppingAbout}</p>
        {list.length === 0 ? (
          <Empty>{k.shoppingEmpty}</Empty>
        ) : (
          <div className="space-y-3">
            {[...bySupplier.entries()].map(([supplierId, lines]) => {
              const supplier = supplierId ? supplierOf.get(supplierId) : null;
              const text = lines
                .map((l) => fill(k.shoppingLine, { item: l.name, buy: quantityText(l.buy, l.unit, locale), need: quantityText(l.need, l.unit, locale), have: quantityText(l.have, l.unit, locale) }))
                .join("\n");
              return (
                <div key={supplierId ?? "none"} className="rounded-xl border border-rule bg-paper p-4">
                  <p className="mb-1 font-bold">{supplier?.name ?? k.noSupplier}</p>
                  <p className="mb-2 whitespace-pre-line">{text}</p>
                  {supplier ? (
                    <a
                      href={whatsappLink(fill(k.shoppingMessage, { supplier: supplier.name, kennel: org.name, items: text }), supplier.phone)}
                      target="_blank"
                      rel="noreferrer"
                      className={buttonStyles.whatsapp}
                    >
                      {fill(k.sendList, { supplier: supplier.name })}
                    </a>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </Section>

      <Section title={k.batch}>
        <ActionForm action={recordBatch} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
          <p className="text-sm text-slate sm:col-span-2">{k.batchAbout}</p>
          <Field label={k.recipe}>
            <Select name="versionId" required defaultValue={plan[0] ? (recipeOf.get(plan[0].recipe_id)?.version_id ?? "") : ""}>
              <option value="" disabled>
                {k.recipe}
              </option>
              {recipes.data
                .filter((r) => !r.is_retired)
                .map((r) => (
                  <option key={r.recipe_id} value={r.version_id!}>
                    {r.name}
                  </option>
                ))}
            </Select>
          </Field>
          <Field label={k.cookedKg}>
            <Input name="kg" inputMode="decimal" required autoComplete="off" defaultValue={plan[0] ? String(plan[0].cook / 1000) : ""} />
          </Field>
          <Field label={k.packs} hint={fill(k.packsHint, { pack: `${org.food_pack_g} g` })}>
            <Input name="packs" inputMode="numeric" required autoComplete="off" />
          </Field>
          <Field label={k.cookedOn}>
            <Input name="cookedOn" type="date" defaultValue={today} max={today} required />
          </Field>
          <Field label={k.cook}>
            <Select name="cookId" defaultValue="">
              <option value="">{m.common.you}</option>
              {cooks.map((c) => (
                <option key={c.user_id} value={c.user_id}>
                  {c.display_name}
                  {c.skills.includes("cook") ? ` (${m.skills.names.cook})` : ""}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={k.forBoarders} hint={k.forBoardersHint}>
            <Input name="boardersOn" type="date" defaultValue={onKitchen.length > 0 ? day : ""} />
          </Field>
          <div className="sm:col-span-2">
            <Field label={k.note}>
              <Input name="note" maxLength={300} autoComplete="off" />
            </Field>
          </div>
          <div className="sm:col-span-2">
            <SubmitButton pendingLabel={k.recording}>{k.recordBatch}</SubmitButton>
          </div>
        </ActionForm>
      </Section>

      <Section title={k.packing} count={deliveries.data.length}>
        <p className="mb-2 text-sm text-slate">{k.packingAbout}</p>
        {deliveries.data.length > 0 ? (
          // Pack all (M54): the count first, then one tap. The form stays once all are packed, to say so.
          <ActionForm action={packAll} className="mb-3">
            <input type="hidden" name="date" value={day} />
            {toPack > 0 ? (
              <details>
                <summary className={`${buttonStyles.secondary} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}>{m.packAll.button}</summary>
                <div className="mt-2 space-y-3 rounded-lg bg-marigold-soft p-3">
                  <p className="font-semibold">{plural(language, toPack, m.packAll.confirm)}</p>
                  <SubmitButton pendingLabel={m.packAll.packing}>{m.packAll.yes}</SubmitButton>
                </div>
              </details>
            ) : null}
          </ActionForm>
        ) : null}
        {deliveries.data.length === 0 ? (
          <Empty>{k.packingEmpty}</Empty>
        ) : (
          <Ledger>
            {deliveries.data.map((d) => {
              const options = usable(d.recipe_id);
              const what = d.kind === "item" ? fill(m.food.pieces, { n: d.quantity }) : plural(language, d.packs, m.food.packsOf, { kg: formatKg(d.grams, locale) });
              return (
                <LedgerRow key={d.id}>
                  <div className="min-w-48 flex-1">
                    <p className="font-bold">
                      {fill(k.packingLine, { pet: d.pets?.name ?? "", parent: d.clients?.full_name ?? "", packs: what, recipe: recipeOf.get(d.recipe_id ?? "")?.name ?? m.deliveryKinds[d.kind] })}
                    </p>
                    <p className="text-sm text-slate">{m.slots[d.slot]}</p>
                  </div>
                  {d.status === "planned" ? (
                    d.kind === "item" || options.length > 0 ? (
                      <ActionForm action={packDelivery} className="flex flex-wrap items-end gap-2">
                        <input type="hidden" name="deliveryId" value={d.id} />
                        {d.kind === "item" ? null : (
                          <Select name="batchId" defaultValue={options[0]?.id} aria-label={k.fromBatch} className="w-auto">
                            {options.map((b) => (
                              <option key={b.id} value={b.id}>
                                {b.number}
                              </option>
                            ))}
                          </Select>
                        )}
                        <SubmitButton variant="secondary" pendingLabel={k.packingNow}>
                          {k.pack}
                        </SubmitButton>
                      </ActionForm>
                    ) : (
                      <span className="text-sm text-slate">{k.noBatch}</span>
                    )
                  ) : (
                    <div className="text-right">
                      <Badge tone={d.status === "delivered" ? "good" : "neutral"}>{m.deliveryStatus[d.status]}</Badge>
                      {packedFrom(d.batch_id) ? <p className="mt-1 text-sm text-slate">{fill(k.packed, { number: packedFrom(d.batch_id)! })}</p> : null}
                    </div>
                  )}
                </LedgerRow>
              );
            })}
          </Ledger>
        )}
      </Section>

      <Section title={k.batches}>
        {batches.data.length === 0 ? (
          <Empty>{k.batchesEmpty}</Empty>
        ) : (
          <Ledger>
            {batches.data.slice(0, 10).map((b) => (
              <li key={b.id}>
                <Link href={`/app/kitchen/batches/${b.id}`} className="flex min-h-12 flex-wrap items-center gap-2 px-4 py-3 hover:bg-ground">
                  <span className="flex-1 font-semibold">
                    {plural(language, b.packs, k.batchLine, { number: b.number, recipe: b.recipes?.name ?? "", kg: formatKg(b.grams, locale) })}
                  </span>
                  <Badge tone={b.use_by < today ? "alert" : "neutral"}>{fill(k.usedBy, { date: formatDate(b.use_by, locale) })}</Badge>
                </Link>
              </li>
            ))}
          </Ledger>
        )}
      </Section>
    </>
  );
}
