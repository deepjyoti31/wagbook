import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, DoorTag, Empty, Field, Input, Ledger, LedgerRow, Loading, Notice, PageTitle, Section } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { addKennels, setKennelActive } from "./actions";

export const metadata: Metadata = { title: "Kennels" };

export default function KennelsPage({ searchParams }: PageProps<"/app/more/kennels">) {
  return (
    <>
      <PageTitle title="Kennels" />
      <Suspense fallback={<Loading label="Loading kennels" />}>
        <Kennels searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Kennels({ searchParams }: Pick<PageProps<"/app/more/kennels">, "searchParams">) {
  const welcome = (await searchParams).welcome === "1";
  const { org, canManage } = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase.from("kennels").select("id, name, is_active").eq("org_id", org.id).order("sort_order").order("name");
  if (error) throw new Error("Could not load kennels.");
  const active = data.filter((k) => k.is_active).length;

  return (
    <>
      {welcome ? <Notice tone="ok">{org.name} is set up. Add your kennels so Wagbook can stop double bookings.</Notice> : null}

      {canManage ? (
        <Section title="Add kennels">
          <ActionForm action={addKennels} className="grid items-end gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-4">
            <Field label="Name starts with">
              <Input name="prefix" defaultValue="K" maxLength={20} />
            </Field>
            <Field label="How many">
              <Input name="count" type="number" min={1} max={200} defaultValue={data.length === 0 ? 10 : 1} required />
            </Field>
            <Field label="First number">
              <Input name="startAt" type="number" min={0} max={9999} defaultValue={data.length + 1} required />
            </Field>
            <SubmitButton pendingLabel="Adding">Add</SubmitButton>
          </ActionForm>
        </Section>
      ) : null}

      <Section title="Your kennels" count={data.length}>
        {data.length === 0 ? (
          <Empty>No kennels yet. {canManage ? "Add them above." : "Ask an owner or manager to add them."}</Empty>
        ) : (
          <>
            <p className="mb-3 text-slate">
              {active} in service. This is the most pets Wagbook will let you book for any one day.
            </p>
            <Ledger>
              {data.map((k) => (
                <LedgerRow key={k.id}>
                  <div className="flex flex-1 items-center gap-3">
                    <DoorTag name={k.name} />
                    {k.is_active ? null : <Badge tone="alert">Out of service</Badge>}
                  </div>
                  {canManage ? (
                    <ActionForm action={setKennelActive} className="contents">
                      <input type="hidden" name="kennelId" value={k.id} />
                      <input type="hidden" name="active" value={k.is_active ? "false" : "true"} />
                      <SubmitButton variant="quiet">{k.is_active ? "Take out of service" : "Put back in service"}</SubmitButton>
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
