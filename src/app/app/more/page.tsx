import Link from "next/link";
import { Suspense } from "react";
import { MoreMenu, type MoreGroup } from "@/components/more-menu";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Loading, Notice, PageTitle, Select } from "@/components/ui";
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
      <div id="account" className="mt-2 max-w-3xl scroll-mt-4 rounded-2xl border border-rule bg-paper p-5 lg:p-6">
        <Suspense fallback={<Loading />}>
          <Account />
        </Suspense>
      </div>
    </>
  );
}

async function Menu({ searchParams }: Pick<PageProps<"/app/more">, "searchParams">) {
  const done = (await searchParams).done;
  const { org, canManage, role, displayName } = await requireOrg();
  const { m, language } = await getAppI18n();
  const supabase = await createClient();
  const [forms, level, memberships] = await Promise.all([
    supabase.from("intake_submissions").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("status", "new"),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    getMemberships(),
  ]);
  const links = menuFor(org, canManage);
  const groups: MoreGroup[] = [
    ...MENU_GROUPS.map((group) => ({
      key: group,
      title: m.more.groups[group],
      // The day's work and the money say what each page is for; what is set up once is named only.
      describe: group === "daily" || group === "money",
      fold: group === "setup" ? 5 : undefined,
      links: links
        .filter((l) => l.group === group)
        .map((l) => ({ href: l.href, title: m.more.links[l.key].title, about: m.more.links[l.key].about, count: l.key === "intake" ? (forms.count ?? 0) : undefined })),
    })),
    {
      key: "you",
      title: m.more.you,
      describe: false,
      links: [
        { href: "/app/more#account", title: m.language.title, about: "", value: LANGUAGE_NAMES[language] },
        { href: "/app/more/two-step", title: m.more.twoStepLink, about: "", value: level.data?.nextLevel === "aal2" ? m.more.twoStepOn : m.more.twoStepOff },
        { href: "/app/more/password", title: m.account.passwordLink, about: "" },
      ],
    },
  ];
  const name = displayName || org.name;
  const others = memberships.filter((x) => x.organizations!.id !== org.id).length;
  return (
    <>
      {/* Phone: who is signed in on a dark bar, in place of the kennel's name. */}
      <header className="wb-dark -mx-4 -mt-[18px] mb-3.5 flex flex-col gap-3 bg-ink px-4 pb-4 pt-3.5 text-paper sm:hidden">
        <h1 className="text-[26px] font-extrabold leading-[1.15] tracking-[-0.02em]">{m.more.title}</h1>
        <div className="flex items-center gap-3 rounded-xl bg-ink-soft px-3 py-2.5">
          <span className="inline-flex size-10 shrink-0 items-center justify-center rounded-full bg-[#dfe6f3] font-extrabold text-ink">{name.trim().charAt(0).toUpperCase() || "?"}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate font-bold">{name}</p>
            <p className="truncate text-[13px] text-[#c9d1e0]">{fill(m.more.roleAt, { role: m.labels.role[role], kennel: org.name })}</p>
          </div>
          {others > 0 ? (
            <Link href="#account" className="inline-flex min-h-11 items-center px-1 text-sm font-bold text-marigold">
              {m.more.switch}
            </Link>
          ) : null}
        </div>
      </header>
      <div className="hidden sm:block">
        <PageTitle title={m.more.title} />
      </div>
      {done === "language" ? <Notice tone="ok">{m.language.saved}</Notice> : null}
      <MoreMenu groups={groups} words={{ findPage: m.more.findPage, noPage: m.more.noPage, andMore: m.more.andMore }} />
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
        <button type="submit" className={`${buttonStyles.secondary} w-full text-alert-ink!`}>
          {m.more.signOut}
        </button>
      </form>
    </>
  );
}
