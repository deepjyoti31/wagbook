import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Badge, Field, Input, Ledger, LedgerRow, Loading, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { inviteMember, removeMember } from "./actions";

export const metadata: Metadata = { title: "People" };

const ROLE_LABEL = { owner: "Owner", manager: "Manager", staff: "Staff" } as const;

export default function PeoplePage() {
  return (
    <>
      <PageTitle title="People" />
      <Suspense fallback={<Loading label="Loading people" />}>
        <People />
      </Suspense>
    </>
  );
}

async function People() {
  const { org, user, role, canManage } = await requireOrg();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("memberships")
    .select("user_id, role, display_name, accepted_at")
    .eq("org_id", org.id)
    .order("created_at");
  if (error) throw new Error("Could not load people.");

  // Mirrors the database rule: managers manage staff and managers, only owners manage owners.
  const canRemove = (target: (typeof data)[number]) => target.user_id !== user.id && (role === "owner" || (role === "manager" && target.role !== "owner"));

  return (
    <>
      <Section title={`Who works at ${org.name}`} count={data.length}>
        <Ledger>
          {data.map((m) => (
            <LedgerRow key={m.user_id}>
              <div className="flex-1">
                <p className="text-lg font-bold">
                  {m.display_name} {m.user_id === user.id ? <span className="font-normal text-slate">(you)</span> : null}
                </p>
                <p className="text-slate">
                  {ROLE_LABEL[m.role]} {m.accepted_at ? null : <Badge tone="attention">Invited, not yet accepted</Badge>}
                </p>
              </div>
              {canRemove(m) ? (
                <ActionForm action={removeMember} className="contents">
                  <input type="hidden" name="userId" value={m.user_id} />
                  <SubmitButton variant="quiet" pendingLabel="Removing">
                    {m.accepted_at ? "Remove" : "Withdraw invitation"}
                  </SubmitButton>
                </ActionForm>
              ) : null}
            </LedgerRow>
          ))}
        </Ledger>
      </Section>

      {canManage ? (
        <Section title="Invite someone">
          <p className="mb-3 text-slate">
            They need a Wagbook account first, made with the same email you enter here. Staff can run the day: bookings, check-in, care and
            payments. Managers can also change kennels, prices and settings. Owners can do everything, including managing other owners.
          </p>
          <ActionForm action={inviteMember} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
            <Field label="Their name">
              <Input name="displayName" required maxLength={80} autoComplete="off" />
            </Field>
            <Field label="Their email">
              <Input name="email" type="email" required maxLength={254} autoComplete="off" autoCapitalize="none" />
            </Field>
            <Field label="Role">
              <Select name="role" defaultValue="staff">
                <option value="staff">Staff</option>
                <option value="manager">Manager</option>
                {role === "owner" ? <option value="owner">Owner</option> : null}
              </Select>
            </Field>
            <div className="flex items-end">
              <SubmitButton pendingLabel="Inviting">Invite</SubmitButton>
            </div>
          </ActionForm>
        </Section>
      ) : null}
    </>
  );
}
