import Link from "next/link";
import { Suspense } from "react";
import { Icon } from "@/components/icons";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Ledger, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { switchOrganisation } from "@/app/app/actions";
import { getMemberships, requireOrg } from "@/lib/auth";
import { fill, LANGUAGE_NAMES, LANGUAGES, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { MENU_GROUPS, menuFor } from "@/lib/menu";
import { signOut } from "@/app/login/actions";
import { setMyLanguage } from "./actions";

export const generateMetadata = () => appTitle((m) => m.more.title);

export default function MorePage({ searchParams }: PageProps<"/app/more">) {
  return (
    <>
      <Suspense fallback={<Loading />}>
        <Menu searchParams={searchParams} />
      </Suspense>
      <div className="mt-2 max-w-3xl rounded-2xl border border-rule bg-paper p-5 lg:p-6">
        <Suspense fallback={<Loading />}>
          <Account />
        </Suspense>
      </div>
    </>
  );
}

async function Menu({ searchParams }: Pick<PageProps<"/app/more">, "searchParams">) {
  const done = (await searchParams).done;
  const { org, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  return (
    <>
      <PageTitle title={m.more.title} />
      {done === "language" ? <Notice tone="ok">{m.language.saved}</Notice> : null}
      {/* Side by side on a laptop, one under another on a phone. */}
      <div className="gap-6 @4xl:columns-2 [&>section]:break-inside-avoid">
      {MENU_GROUPS.map((group) => {
        const links = menuFor(org, canManage).filter((l) => l.group === group);
        return links.length === 0 ? null : (
          <Section key={group} title={m.more.groups[group]}>
            <Ledger>
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="flex min-h-14 items-center gap-3 px-5 py-3.5 hover:bg-wash">
                    <span className="min-w-0 flex-1">
                      <span className="block font-bold">{m.more.links[l.key].title}</span>
                      <span className="block text-sm text-slate">{m.more.links[l.key].about}</span>
                    </span>
                    <Icon name="forward" className="size-5 text-slate/60" />
                  </Link>
                </li>
              ))}
            </Ledger>
          </Section>
        );
      })}
      </div>
    </>
  );
}

async function Account() {
  const { user, org, role, displayName } = await requireOrg();
  const { m, language } = await getAppI18n();
  const invitations = (await (await createClient()).rpc("my_invitations")).data ?? [];
  const others = (await getMemberships()).filter((x) => x.organizations!.id !== org.id);
  const level = await (await createClient()).auth.mfa.getAuthenticatorAssuranceLevel();
  const twoStepOn = level.data?.nextLevel === "aal2";
  return (
    <>
      <p className="text-slate">
        {fill(m.more.signedInAs, { name: displayName, email: user.email ?? m.more.noEmail, role: m.more.roleInSentence[role], kennel: org.name })}
      </p>
      {invitations.length > 0 ? (
        <p className="mt-4">
          <Link href="/onboarding" className="font-semibold underline underline-offset-4">
            {plural(language, invitations.length, m.more.invitations)}
          </Link>
        </p>
      ) : null}
      {others.length > 0 ? (
        <div className="mt-4">
          <p className="mb-2 font-semibold">{m.more.alsoWorkAt}</p>
          <div className="flex flex-wrap gap-2">
            {others.map((x) => (
              <form key={x.organizations!.id} action={switchOrganisation}>
                <input type="hidden" name="orgId" value={x.organizations!.id} />
                <button type="submit" className={buttonStyles.secondary}>
                  {fill(m.more.switchTo, { kennel: x.organizations!.name })}
                </button>
              </form>
            ))}
          </div>
        </div>
      ) : null}
      {role === "owner" ? (
        <div className="mt-4">
          <Link href="/onboarding" className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
            {m.more.addSite}
          </Link>
          <p className="text-sm text-slate">{m.more.addSiteHint}</p>
        </div>
      ) : null}
      {role === "owner" && !twoStepOn ? (
        <div className="mt-4">
          <Notice tone="info">{m.more.ownerNudge}</Notice>
        </div>
      ) : null}
      <p className="mt-4">
        <Link href="/app/more/two-step" className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
          {m.more.twoStepLink}: {twoStepOn ? m.more.twoStepOn : m.more.twoStepOff}
        </Link>
      </p>
      <p>
        <Link href="/app/more/password" className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
          {m.account.passwordLink}
        </Link>
      </p>
      <ActionForm action={setMyLanguage} className="mt-6 flex flex-wrap items-end gap-2">
        <div className="min-w-48 flex-1">
          <Field label={m.language.yours} hint={m.language.yoursHint}>
            <Select name="language" defaultValue={language}>
              {LANGUAGES.map((l) => (
                <option key={l} value={l} lang={l}>
                  {LANGUAGE_NAMES[l]}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
          {m.common.save}
        </SubmitButton>
      </ActionForm>
      {language === "en" ? null : <p className="mt-2 text-sm text-slate">{m.language.draftNote}</p>}
      <form action={signOut} className="mt-6">
        <button type="submit" className={buttonStyles.secondary}>
          {m.more.signOut}
        </button>
      </form>
    </>
  );
}
