import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, DoorTag, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, todayIn } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addKennel, addKennels, changeKennel, setKennelActive } from "./actions";

export const generateMetadata = () => appTitle((m) => m.kennels.title);

export default function KennelsPage({ searchParams }: PageProps<"/app/more/kennels">) {
  return (
    <Suspense fallback={<Loading />}>
      <Kennels searchParams={searchParams} />
    </Suspense>
  );
}

async function Kennels({ searchParams }: Pick<PageProps<"/app/more/kennels">, "searchParams">) {
  const welcome = (await searchParams).welcome === "1";
  const { org, canManage } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const k = m.kennels;
  const today = todayIn(org.time_zone);
  const supabase = await createClient();
  const { data, error } = await supabase.from("kennels").select("id, name, is_active, sort_order, service_from").eq("org_id", org.id).order("sort_order").order("name");
  if (error) throw new Error("Could not load kennels.");
  const active = data.filter((x) => x.is_active).length;

  return (
    <>
      <PageTitle title={k.title} />
      {welcome ? <Notice tone="ok">{fill(k.welcome, { kennel: org.name })}</Notice> : null}

      {canManage ? (
        <Section title={k.add}>
          <ActionForm action={addKennel} className="mb-4 space-y-4 rounded-xl border border-rule bg-paper p-4">
            <p className="font-bold">{k.addOne}</p>
            <Field label={k.name} hint={k.nameHint}>
              <Input name="name" maxLength={40} required />
            </Field>
            <SubmitButton pendingLabel={m.common.adding}>{k.addOneButton}</SubmitButton>
          </ActionForm>
          <ActionForm action={addKennels} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-4">
            <p className="font-bold sm:col-span-4">{k.addRow}</p>
            <Field label={k.prefix}>
              <Input name="prefix" defaultValue="K" maxLength={20} />
            </Field>
            <Field label={k.count}>
              <Input name="count" type="number" min={1} max={200} defaultValue={data.length === 0 ? 10 : 1} required />
            </Field>
            <Field label={k.startAt}>
              <Input name="startAt" type="number" min={0} max={9999} defaultValue={data.length + 1} required />
            </Field>
            <SubmitButton pendingLabel={m.common.adding}>{k.addRowButton}</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      <Section title={k.yours} count={data.length}>
        {data.length === 0 ? (
          <Empty>{canManage ? k.emptyManager : k.emptyStaff}</Empty>
        ) : (
          <>
            <p className="mb-3 text-slate">{fill(k.inService, { n: active })}</p>
            <Ledger>
              {data.map((x) => (
                <LedgerRow key={x.id}>
                  <div className="flex flex-1 flex-wrap items-center gap-3">
                    <DoorTag name={x.name} empty={m.common.noKennel} />
                    {x.is_active ? null : <Badge tone="alert">{fill(k.outSince, { date: formatDate(x.service_from as string, locale) })}</Badge>}
                  </div>
                  {canManage ? (
                    <details className="w-full">
                      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">
                        {x.is_active ? k.takeOut : k.putBack}
                        <span className="sr-only"> {x.name}</span>
                      </summary>
                      {/* A day before today when it happened earlier, so past reports count the kennels there that day (M44). */}
                      <ActionForm action={setKennelActive} className="mt-2 flex flex-wrap items-end gap-3">
                        <input type="hidden" name="kennelId" value={x.id} />
                        <input type="hidden" name="active" value={x.is_active ? "false" : "true"} />
                        <div className="min-w-44 flex-1">
                          <Field label={k.from} hint={k.fromHint}>
                            <Input name="from" type="date" required max={today} min={x.service_from ?? undefined} defaultValue={today} />
                          </Field>
                        </div>
                        <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                          {x.is_active ? k.takeOut : k.putBack}
                        </SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                  {canManage ? (
                    <details className="w-full">
                      <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">
                        {k.change}
                        <span className="sr-only"> {x.name}</span>
                      </summary>
                      <ActionForm action={changeKennel} className="mt-2 space-y-4">
                        <input type="hidden" name="kennelId" value={x.id} />
                        <p className="sr-only">{fill(k.changeTitle, { kennel: x.name })}</p>
                        <Field label={k.name} hint={k.nameHint}>
                          <Input name="name" maxLength={40} required defaultValue={x.name} />
                        </Field>
                        <Field label={k.position} hint={k.positionHint}>
                          <Input name="position" type="number" min={0} max={9999} required defaultValue={x.sort_order} />
                        </Field>
                        <Field label={x.is_active ? k.inSince : k.outSinceLabel} hint={k.sinceHint}>
                          <Input name="since" type="date" required max={today} defaultValue={x.service_from ?? today} />
                        </Field>
                        <SubmitButton pendingLabel={m.common.saving}>{m.common.saveChanges}</SubmitButton>
                      </ActionForm>
                    </details>
                  ) : null}
                </LedgerRow>
              ))}
            </Ledger>
          </>
        )}
      </Section>
    </>
  );
}
