import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Empty, Field, Input, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { addDays, dailyGrams, formatMoney, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { CUSTOMER_SOURCES, portionSettings, WEEKDAYS } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";
import { addOrder, startSubscription } from "../actions";

export const generateMetadata = () => appTitle((m) => m.food.start);

export default function NewFoodPage({ searchParams }: PageProps<"/app/food/new">) {
  return (
    <Suspense fallback={<Loading />}>
      <NewFood searchParams={searchParams} />
    </Suspense>
  );
}

async function NewFood({ searchParams }: Pick<PageProps<"/app/food/new">, "searchParams">) {
  const params = await searchParams;
  const petId = typeof params.pet === "string" && /^[0-9a-f-]{36}$/.test(params.pet) ? params.pet : null;
  const isOrder = params.kind === "order";
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const f = m.food;
  const supabase = await createClient();
  const today = todayIn(org.time_zone);
  const title = isOrder ? f.order : f.start;

  if (!petId) {
    const pets = await supabase.from("pets").select("id, name, clients(full_name)").eq("org_id", org.id).is("deleted_at", null).is("passed_away_on", null).order("name").limit(1000);
    if (pets.error) throw new Error("Could not load pets.");
    return (
      <>
        <PageTitle title={title}>
          <Link href="/app/food" className={buttonStyles.quiet}>
            {f.title}
          </Link>
        </PageTitle>
        {pets.data.length === 0 ? (
          <Empty>{m.pets.none}</Empty>
        ) : (
          <form action="/app/food/new" className="flex flex-wrap items-end gap-2 rounded-xl border border-rule bg-paper p-4">
            {isOrder ? <input type="hidden" name="kind" value="order" /> : null}
            <div className="min-w-56 flex-1">
              <Field label={f.pet}>
                <Select name="pet" required defaultValue="">
                  <option value="" disabled>
                    {f.choosePet}
                  </option>
                  {pets.data.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.clients?.full_name})
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
            <button type="submit" className={buttonStyles.primary}>
              {m.common.open}
            </button>
          </form>
        )}
      </>
    );
  }

  const pet = await supabase.from("pets").select("id, name, client_id, weight_g, clients(full_name)").eq("org_id", org.id).eq("id", petId).maybeSingle();
  if (pet.error || !pet.data) throw new Error("Could not load the pet.");
  const p = pet.data;
  const [food, addresses, products, recipes] = await Promise.all([
    supabase.from("pet_food").select("plan, goal, grams_by_hand").eq("org_id", org.id).eq("pet_id", p.id).maybeSingle(),
    supabase.from("client_addresses").select("id, kind, line, area, postal_code").eq("org_id", org.id).eq("client_id", p.client_id).order("created_at"),
    supabase.from("food_products").select("id, kind, name, price_minor").eq("org_id", org.id).eq("is_active", true).order("name"),
    supabase.from("recipe_current").select("recipe_id, name, is_retired, rotation_position").eq("org_id", org.id),
  ]);
  const grams = dailyGrams({ weight_g: p.weight_g }, food.data ?? null, portionSettings(org));
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });
  const subFood = (products.data ?? []).filter((x) => x.kind === "subscription");
  const orderFood = products.data ?? [];
  const addressSelect = (
    <Field label={f.address}>
      <Select name="addressId" defaultValue={addresses.data?.[0]?.id ?? ""}>
        <option value="">{f.collect}</option>
        {(addresses.data ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            {m.addresses.kind[a.kind]}: {[a.line, a.area, a.postal_code].filter(Boolean).join(", ")}
          </option>
        ))}
      </Select>
    </Field>
  );
  const slotSelect = (
    <Field label={f.slot}>
      <Select name="slot" defaultValue="morning">
        {(["morning", "afternoon", "evening"] as const).map((s) => (
          <option key={s} value={s}>
            {m.slots[s]}
          </option>
        ))}
      </Select>
    </Field>
  );

  return (
    <>
      <PageTitle title={title}>
        <Link href={`/app/dogs/${p.id}`} className={buttonStyles.quiet}>
          {p.name}
        </Link>
      </PageTitle>
      <p className="mb-4 text-lg">
        {p.name}, {p.clients?.full_name}
      </p>
      {(products.data ?? []).length === 0 ? <Notice tone="info">{f.errors.product}</Notice> : null}

      {isOrder ? (
        <Section title={f.order}>
          <ActionForm action={addOrder} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <input type="hidden" name="petId" value={p.id} />
            <Field label={f.orderKind}>
              <Select name="kind" defaultValue="trial">
                {(["trial", "order", "item"] as const).map((k) => (
                  <option key={k} value={k}>
                    {f.orderKinds[k]}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={f.product}>
              <Select name="productId" required>
                {orderFood.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({m.kitchenSettings.kinds[x.kind]}, {money(x.price_minor)})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={f.orderDate}>
              <Input type="date" name="date" min={today} defaultValue={addDays(today, 1)} required />
            </Field>
            {slotSelect}
            <Field label={f.orderKg}>
              <Input name="kg" inputMode="decimal" autoComplete="off" />
            </Field>
            <Field label={f.orderQuantity}>
              <Input name="quantity" inputMode="numeric" defaultValue="1" />
            </Field>
            <Field label={f.orderRecipe}>
              <Select name="recipeId" defaultValue={(recipes.data ?? []).find((r) => r.rotation_position === 1)?.recipe_id ?? ""}>
                <option value="">{m.common.none}</option>
                {(recipes.data ?? [])
                  .filter((r) => !r.is_retired)
                  .map((r) => (
                    <option key={r.recipe_id} value={r.recipe_id!}>
                      {r.name}
                    </option>
                  ))}
              </Select>
            </Field>
            {addressSelect}
            <div className="sm:col-span-2">
              <Field label={f.orderNote}>
                <Input name="note" maxLength={300} autoComplete="off" />
              </Field>
            </div>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel={m.common.adding}>{f.orderButton}</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      ) : (
        <Section title={f.start}>
          <ActionForm action={startSubscription} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <input type="hidden" name="petId" value={p.id} />
            <Field label={f.product}>
              <Select name="productId" required>
                {subFood.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name} ({fill(m.kitchenSettings.perKg, { amount: money(x.price_minor) })})
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={f.plan}>
              <Select name="plan" defaultValue={food.data?.plan ?? "full"}>
                <option value="full">{m.plans.full}</option>
                <option value="topper">{m.plans.topper}</option>
              </Select>
            </Field>
            <Field label={f.grams} hint={grams === null ? fill(m.petFood.noWeight, { pet: p.name }) : undefined}>
              <Input name="grams" inputMode="numeric" required defaultValue={grams ?? ""} />
            </Field>
            {slotSelect}
            <fieldset className="sm:col-span-2">
              <legend className="mb-1 font-semibold">{f.days}</legend>
              <div className="flex flex-wrap gap-x-4">
                {WEEKDAYS.map((d) => (
                  <label key={d} className="flex min-h-12 items-center gap-2">
                    <input type="checkbox" name={`day_${d}`} defaultChecked={d === 2 || d === 5} className="size-5" />
                    <span>{m.weekdays[d]}</span>
                  </label>
                ))}
              </div>
            </fieldset>
            {addressSelect}
            <Field label={f.startsOn}>
              <Input type="date" name="startsOn" min={today} defaultValue={addDays(today, 2)} required />
            </Field>
            <Field label={f.pay}>
              <Select name="pay" defaultValue="week">
                <option value="week">{f.pays.week}</option>
                <option value="month">{f.pays.month}</option>
              </Select>
            </Field>
            <Field label={f.source}>
              <Select name="source" defaultValue="boarding">
                {CUSTOMER_SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {m.sources[s]}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="sm:col-span-2">
              <SubmitButton pendingLabel={f.starting}>{f.startButton}</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      )}
    </>
  );
}
