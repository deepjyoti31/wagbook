import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { CopyButton } from "@/components/copy-button";
import { Badge, buttonStyles, Field, Input, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, whatsappLink } from "@/lib/core";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { createInviteLink, inviteMember, removeMember, revokeInviteLink, setMemberActive, updateMember } from "./actions";

export const metadata: Metadata = { title: "People" };

const ROLE_LABEL = { owner: "Owner", manager: "Manager", staff: "Staff" } as const;
const ROLE_ABOUT = "Staff run the day: bookings, check-in, care and payments. Managers also change kennels, prices and settings. Owners can do everything, including managing other owners.";

export default function PeoplePage({ searchParams }: PageProps<"/app/more/people">) {
  return (
    <>
      <PageTitle title="People" />
      <Suspense fallback={<Loading label="Loading people" />}>
        <People searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function People({ searchParams }: Pick<PageProps<"/app/more/people">, "searchParams">) {
  const made = (await searchParams).made === "1";
  const { org, user, role, canManage } = await requireOrg();
  const supabase = await createClient();
  const [members, links, origin] = await Promise.all([
    supabase.from("memberships").select("user_id, role, display_name, accepted_at, is_active").eq("org_id", org.id).order("created_at"),
    canManage
      ? supabase
          .from("invitation_links")
          .select("id, token, role, display_name, expires_at")
          .eq("org_id", org.id)
          .is("used_at", null)
          .is("revoked_at", null)
          .gt("expires_at", new Date().toISOString())
          .order("created_at", { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    siteOrigin(),
  ]);
  if (members.error || links.error) throw new Error("Could not load people.");

  // Mirrors the database rule: managers manage staff and managers, only owners manage owners.
  const canChange = (target: (typeof members.data)[number]) => target.user_id !== user.id && (role === "owner" || (role === "manager" && target.role !== "owner"));
  const roles = role === "owner" ? (["staff", "manager", "owner"] as const) : (["staff", "manager"] as const);

  return (
    <>
      <Section title={`Who works at ${org.name}`} count={members.data.length}>
        <ul className="space-y-3">
          {members.data.map((m) => (
            <li key={m.user_id} className={`rounded-xl border bg-paper p-4 ${m.is_active || !m.accepted_at ? "border-rule" : "border-alert"}`}>
              <p className="text-lg font-bold">
                {m.display_name} {m.user_id === user.id ? <span className="font-normal text-slate">(you)</span> : null}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-slate">
                {ROLE_LABEL[m.role]}
                {!m.accepted_at ? <Badge tone="attention">Invited, not yet accepted</Badge> : null}
                {m.accepted_at && !m.is_active ? <Badge tone="alert">Suspended</Badge> : null}
              </p>
              {canChange(m) ? (
                <details className="mt-2">
                  <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">Change</summary>
                  <ActionForm action={updateMember} className="mt-2 grid gap-3 sm:grid-cols-3">
                    <input type="hidden" name="userId" value={m.user_id} />
                    <Field label="Name">
                      <Input name="displayName" required maxLength={80} defaultValue={m.display_name} />
                    </Field>
                    <Field label="Role">
                      <Select name="role" defaultValue={m.role}>
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {ROLE_LABEL[r]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="flex items-end">
                      <SubmitButton variant="secondary">Save</SubmitButton>
                    </div>
                  </ActionForm>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {m.accepted_at ? (
                      <ActionForm action={setMemberActive} className="contents">
                        <input type="hidden" name="userId" value={m.user_id} />
                        <input type="hidden" name="active" value={m.is_active ? "false" : "true"} />
                        <SubmitButton variant="secondary" pendingLabel="Saving">
                          {m.is_active ? "Suspend" : "Restore"}
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                    <ActionForm action={removeMember} className="contents">
                      <input type="hidden" name="userId" value={m.user_id} />
                      <SubmitButton variant="quiet" pendingLabel="Removing">
                        {m.accepted_at ? "Remove" : "Withdraw invitation"}
                      </SubmitButton>
                    </ActionForm>
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      {canManage ? (
        <>
          <Section title="Invite with a link" count={links.data.length}>
            <p className="mb-3 text-slate">For someone who does not use Wagbook yet. Send them the link on WhatsApp. It works once, for seven days. {ROLE_ABOUT}</p>
            {made ? <Notice tone="ok">Link made. Send it to them below.</Notice> : null}
            {links.data.length > 0 ? (
              <ul className="mb-4 space-y-3">
                {links.data.map((l) => {
                  const url = `${origin}/join/${l.token}`;
                  return (
                    <li key={l.id} className="rounded-xl border border-rule bg-paper p-4">
                      <p className="font-bold">
                        {l.display_name}, {ROLE_LABEL[l.role].toLowerCase()}
                      </p>
                      <p className="text-sm text-slate">Works until {formatDate(l.expires_at.slice(0, 10))}.</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a
                          href={whatsappLink(`Hi ${l.display_name}, join ${org.name} on Wagbook with this link: ${url}`)}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonStyles.whatsapp}
                        >
                          Send on WhatsApp
                        </a>
                        <CopyButton text={url} />
                        <ActionForm action={revokeInviteLink} className="contents">
                          <input type="hidden" name="linkId" value={l.id} />
                          <SubmitButton variant="quiet" pendingLabel="Withdrawing">
                            Withdraw
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <ActionForm action={createInviteLink} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
              <Field label="Their name">
                <Input name="displayName" required maxLength={80} autoComplete="off" />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="staff">
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <SubmitButton pendingLabel="Making the link">Make a link</SubmitButton>
              </div>
            </ActionForm>
          </Section>

          <Section title="Invite someone who already has an account">
            <p className="mb-3 text-slate">Enter the email they use for Wagbook. They see the invitation the next time they sign in.</p>
            <ActionForm action={inviteMember} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
              <Field label="Their name">
                <Input name="displayName" required maxLength={80} autoComplete="off" />
              </Field>
              <Field label="Their email">
                <Input name="email" type="email" required maxLength={254} autoComplete="off" autoCapitalize="none" />
              </Field>
              <Field label="Role">
                <Select name="role" defaultValue="staff">
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABEL[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <SubmitButton pendingLabel="Inviting">Invite</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        </>
      ) : null}
    </>
  );
}
