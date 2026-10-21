import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { CopyButton } from "@/components/copy-button";
import { Badge, buttonStyles, Field, Input, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatDate, skillsOffered, whatsappLink } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";
import { createInviteLink, inviteMember, removeMember, revokeInviteLink, setMemberActive, setSkills, updateMember } from "./actions";

export const generateMetadata = () => appTitle((m) => m.people.title);

export default function PeoplePage({ searchParams }: PageProps<"/app/more/people">) {
  return (
    <Suspense fallback={<Loading />}>
      <People searchParams={searchParams} />
    </Suspense>
  );
}

async function People({ searchParams }: Pick<PageProps<"/app/more/people">, "searchParams">) {
  const made = (await searchParams).made === "1";
  const { org, user, role, canManage, canDelete } = await requireOrg();
  const t = await getAppI18n();
  const { m } = t;
  const w = m.people;
  const supabase = await createClient();
  const [members, links, origin] = await Promise.all([
    supabase.from("memberships").select("user_id, role, display_name, accepted_at, is_active, skills").eq("org_id", org.id).order("created_at"),
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
  // Riders (D45) only while the kennel delivers food.
  const base = role === "owner" ? (["staff", "manager", "owner"] as const) : (["staff", "manager"] as const);
  const roles: readonly ("staff" | "manager" | "owner" | "rider")[] = org.offers_food_delivery ? [...base, "rider"] : base;
  // Skills for what the kennel offers (M25). Owners and managers set them, their own included; only owners set an owner's.
  const offered = skillsOffered(org);
  const canSetSkills = (target: (typeof members.data)[number]) => offered.length > 0 && (role === "owner" || (role === "manager" && target.role !== "owner"));

  return (
    <>
      <PageTitle title={w.title} />
      <Section title={fill(w.whoWorks, { kennel: org.name })} count={members.data.length}>
        <ul className="space-y-3">
          {members.data.map((mm) => (
            <li key={mm.user_id} className={`rounded-xl border bg-paper p-4 ${mm.is_active || !mm.accepted_at ? "border-rule" : "border-alert"}`}>
              <p className="text-lg font-bold">
                {mm.display_name} {mm.user_id === user.id ? <span className="font-normal text-slate">{m.common.you}</span> : null}
              </p>
              <p className="flex flex-wrap items-center gap-2 text-slate">
                {m.labels.role[mm.role]}
                {!mm.accepted_at ? <Badge tone="attention">{w.invited}</Badge> : null}
                {mm.accepted_at && !mm.is_active ? <Badge tone="alert">{w.suspended}</Badge> : null}
                {mm.skills.filter((s) => offered.includes(s)).map((s) => (
                  <Badge key={s}>{m.skills.names[s]}</Badge>
                ))}
              </p>
              {canSetSkills(mm) ? (
                <details className="mt-2">
                  <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">
                    {m.skills.title}
                    <span className="sr-only"> {mm.display_name}</span>
                  </summary>
                  <ActionForm action={setSkills} className="mt-2 space-y-2">
                    <input type="hidden" name="userId" value={mm.user_id} />
                    <p className="text-sm text-slate">{m.skills.about}</p>
                    <div className="grid gap-1 sm:grid-cols-2">
                      {offered.map((s) => (
                        <label key={s} className="flex min-h-12 items-center gap-3">
                          <input type="checkbox" name={`skill_${s}`} defaultChecked={mm.skills.includes(s)} className="size-5" />
                          <span>{m.skills.names[s]}</span>
                        </label>
                      ))}
                    </div>
                    <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                      {m.skills.save}
                    </SubmitButton>
                  </ActionForm>
                </details>
              ) : null}
              {canChange(mm) ? (
                <details className="mt-2">
                  <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">{m.common.change}</summary>
                  <ActionForm action={updateMember} className="mt-2 grid gap-3 sm:grid-cols-3">
                    <input type="hidden" name="userId" value={mm.user_id} />
                    <Field label={w.name}>
                      <Input name="displayName" required maxLength={80} defaultValue={mm.display_name} />
                    </Field>
                    <Field label={w.role}>
                      <Select name="role" defaultValue={mm.role}>
                        {roles.map((r) => (
                          <option key={r} value={r}>
                            {m.labels.role[r]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="flex items-end">
                      <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                        {m.common.save}
                      </SubmitButton>
                    </div>
                  </ActionForm>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {mm.accepted_at ? (
                      <ActionForm action={setMemberActive} className="contents">
                        <input type="hidden" name="userId" value={mm.user_id} />
                        <input type="hidden" name="active" value={mm.is_active ? "false" : "true"} />
                        <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
                          {mm.is_active ? w.suspend : w.restore}
                        </SubmitButton>
                      </ActionForm>
                    ) : null}
                    {canDelete ? (
                      <ActionForm action={removeMember} className="contents">
                        <input type="hidden" name="userId" value={mm.user_id} />
                        <ConfirmStep
                          label={mm.accepted_at ? m.common.remove : w.withdrawInvitation}
                          warning={m.common.cannotUndo}
                          confirm={mm.accepted_at ? w.yesRemove : w.yesWithdraw}
                          pending={m.common.removing}
                        />
                      </ActionForm>
                    ) : null}
                  </div>
                </details>
              ) : null}
            </li>
          ))}
        </ul>
      </Section>

      {canManage ? (
        <>
          <Section title={w.byLink.title} count={links.data.length}>
            <p className="mb-3 text-slate">
              {w.byLink.intro} {w.rolesAbout}
            </p>
            {made ? <Notice tone="ok">{w.byLink.made}</Notice> : null}
            {links.data.length > 0 ? (
              <ul className="mb-4 space-y-3">
                {links.data.map((l) => {
                  const url = `${origin}/join/${l.token}`;
                  return (
                    <li key={l.id} className="rounded-xl border border-rule bg-paper p-4">
                      <p className="font-bold">
                        {fill(w.byLink.who, { name: l.display_name, role: w.roleInLine[l.role] })}
                      </p>
                      <p className="text-sm text-slate">{fill(w.byLink.worksUntil, { date: formatDate(l.expires_at.slice(0, 10), t.locale) })}</p>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <a
                          href={whatsappLink(fill(m.whatsapp.joinInvite, { name: l.display_name, kennel: org.name, url }))}
                          target="_blank"
                          rel="noreferrer"
                          className={buttonStyles.whatsapp}
                        >
                          {m.common.sendOnWhatsapp}
                        </a>
                        <CopyButton text={url} words={m.copy} />
                        <ActionForm action={revokeInviteLink} className="contents">
                          <input type="hidden" name="linkId" value={l.id} />
                          <SubmitButton variant="quiet" pendingLabel={w.byLink.withdrawing}>
                            {w.byLink.withdraw}
                          </SubmitButton>
                        </ActionForm>
                      </div>
                    </li>
                  );
                })}
              </ul>
            ) : null}
            <ActionForm action={createInviteLink} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
              <Field label={w.theirName}>
                <Input name="displayName" required maxLength={80} autoComplete="off" />
              </Field>
              <Field label={w.role}>
                <Select name="role" defaultValue="staff">
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {m.labels.role[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <SubmitButton pendingLabel={w.byLink.making}>{w.byLink.make}</SubmitButton>
              </div>
            </ActionForm>
          </Section>

          <Section title={w.byEmail.title}>
            <p className="mb-3 text-slate">{w.byEmail.intro}</p>
            <ActionForm action={inviteMember} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
              <Field label={w.theirName}>
                <Input name="displayName" required maxLength={80} autoComplete="off" />
              </Field>
              <Field label={w.byEmail.email}>
                <Input name="email" type="email" required maxLength={254} autoComplete="off" autoCapitalize="none" />
              </Field>
              <Field label={w.role}>
                <Select name="role" defaultValue="staff">
                  {roles.map((r) => (
                    <option key={r} value={r}>
                      {m.labels.role[r]}
                    </option>
                  ))}
                </Select>
              </Field>
              <div className="flex items-end">
                <SubmitButton pendingLabel={w.byEmail.inviting}>{w.byEmail.invite}</SubmitButton>
              </div>
            </ActionForm>
          </Section>
        </>
      ) : null}
    </>
  );
}
