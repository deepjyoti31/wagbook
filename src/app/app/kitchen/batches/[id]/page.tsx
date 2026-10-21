import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Badge, buttonStyles, Empty, Ledger, LedgerRow, Loading, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, formatKg, formatMoney, formatPhone } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { quantityText } from "@/lib/kitchen";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.kitchen.batches);

export default function BatchPage({ params }: PageProps<"/app/kitchen/batches/[id]">) {
  return (
    <Suspense fallback={<Loading />}>
      <Batch params={params} />
    </Suspense>
  );
}

async function Batch({ params }: Pick<PageProps<"/app/kitchen/batches/[id]">, "params">) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org, canManage } = await requireOrg();
  const t = await getAppI18n();
  const { m, locale } = t;
  const w = m.batchPage;
  const supabase = await createClient();
  const [batch, moves, who] = await Promise.all([
    supabase.from("batches").select("id, number, cooked_on, use_by, grams, packs, cook_id, note, recipes(name), recipe_versions(version)").eq("org_id", org.id).eq("id", id).maybeSingle(),
    supabase.from("stock_moves").select("id, quantity, stock_items(name, unit)").eq("org_id", org.id).eq("batch_id", id),
    supabase.rpc("batch_recipients", { p_org: org.id, p_batch: id }),
  ]);
  if (batch.error || moves.error || who.error) throw new Error("Could not load the batch.");
  if (!batch.data) notFound();
  const b = batch.data;
  const cook = b.cook_id ? (await supabase.from("memberships").select("display_name").eq("org_id", org.id).eq("user_id", b.cook_id).maybeSingle()).data?.display_name : null;
  const cost = canManage ? (await supabase.rpc("batch_cost", { p_org: org.id, p_batch: id })).data : null;
  const money = (minor: number) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true });

  return (
    <>
      <PageTitle title={fill(w.title, { number: b.number })}>
        <Link href="/app/kitchen" className={buttonStyles.quiet}>
          {m.kitchen.title}
        </Link>
      </PageTitle>
      <div className="mb-5 space-y-1">
        <p className="text-lg font-bold">{fill(w.recipe, { recipe: b.recipes?.name ?? "", version: b.recipe_versions?.version ?? 1 })}</p>
        <p>{fill(w.cooked, { date: formatDate(b.cooked_on, locale), cook: cook ?? m.common.notKnown, date2: formatDate(b.use_by, locale) })}</p>
        <p className="text-slate">{fill(w.weight, { kg: formatKg(b.grams, locale), packs: b.packs })}</p>
        {canManage ? (
          <p className="font-semibold">{cost != null ? fill(w.cost, { amount: money(cost), perKg: money(Math.round((cost * 1000) / b.grams)) }) : w.noCost}</p>
        ) : null}
        {b.note ? <p className="text-slate">{b.note}</p> : null}
      </div>

      <Section title={w.who} count={who.data.length}>
        <p className="mb-2 text-sm text-slate">{w.whoAbout}</p>
        {who.data.length === 0 ? (
          <Empty>{w.nobody}</Empty>
        ) : (
          <Ledger>
            {who.data.map((r, i) => (
              <LedgerRow key={`${r.pet_id}-${i}`}>
                <div className="flex-1">
                  <Link href={`/app/dogs/${r.pet_id}`} className="font-bold underline underline-offset-4">
                    {r.pet_name}
                  </Link>{" "}
                  <span className="text-slate">{r.client_name}</span>
                </div>
                <Badge>{fill(r.kind === "delivery" ? w.delivery : w.boarder, { date: formatDate(r.on_date, locale) })}</Badge>
                <a href={`tel:${r.phone}`} className="inline-flex min-h-12 items-center underline underline-offset-4">
                  {formatPhone(r.phone)}
                </a>
              </LedgerRow>
            ))}
          </Ledger>
        )}
      </Section>

      <Section title={w.used}>
        <Ledger>
          {moves.data.map((mv) => (
            <LedgerRow key={mv.id}>
              <span className="flex-1">{mv.stock_items?.name}</span>
              <span className="tabular-nums">{quantityText(-mv.quantity, mv.stock_items?.unit ?? "g", locale)}</span>
            </LedgerRow>
          ))}
        </Ledger>
      </Section>
    </>
  );
}
