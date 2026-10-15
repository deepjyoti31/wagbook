import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, DoorTag, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { addKennels, setKennelActive } from "./actions";

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
  const { m } = await getAppI18n();
  const k = m.kennels;
  const supabase = await createClient();
  const { data, error } = await supabase.from("kennels").select("id, name, is_active").eq("org_id", org.id).order("sort_order").order("name");
  if (error) throw new Error("Could not load kennels.");
  const active = data.filter((x) => x.is_active).length;

  return (
    <>
      <PageTitle title={k.title} />
      {welcome ? <Notice tone="ok">{fill(k.welcome, { kennel: org.name })}</Notice> : null}

      {canManage ? (
        <Section title={k.add}>
          <ActionForm action={addKennels} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-4">
            <Field label={k.prefix}>
              <Input name="prefix" defaultValue="K" maxLength={20} />
            </Field>
            <Field label={k.count}>
              <Input name="count" type="number" min={1} max={200} defaultValue={data.length === 0 ? 10 : 1} required />
            </Field>
            <Field label={k.startAt}>
              <Input name="startAt" type="number" min={0} max={9999} defaultValue={data.length + 1} required />
            </Field>
            <SubmitButton pendingLabel={m.common.adding}>{m.common.add}</SubmitButton>
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
                  <div className="flex flex-1 items-center gap-3">
                    <DoorTag name={x.name} empty={m.common.noKennel} />
                    {x.is_active ? null : <Badge tone="alert">{k.outOfService}</Badge>}
                  </div>
                  {canManage ? (
                    <ActionForm action={setKennelActive} className="contents">
                      <input type="hidden" name="kennelId" value={x.id} />
                      <input type="hidden" name="active" value={x.is_active ? "false" : "true"} />
                      <SubmitButton variant="quiet" pendingLabel={m.common.saving}>
                        {x.is_active ? k.takeOut : k.putBack}
                      </SubmitButton>
                    </ActionForm>
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
