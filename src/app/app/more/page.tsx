import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Ledger, Loading, Notice, PageTitle, Section, Select } from "@/components/ui";
import { switchOrganisation } from "@/app/app/actions";
import { getMemberships, requireOrg } from "@/lib/auth";
import type { Offers } from "@/lib/core";
import { fill, LANGUAGE_NAMES, LANGUAGES, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import type { Messages } from "@/messages";
import { signOut } from "@/app/login/actions";
import { setMyLanguage } from "./actions";

export const generateMetadata = () => appTitle((m) => m.more.title);

// Reports, expenses and the history are for owners and managers (D20), so staff are not shown them.
// A link with `when` shows only while the kennel offers that (D44). Links are grouped so the
// day's work comes first and what is set up once comes after.
type Group = keyof Messages["more"]["groups"];
const LINKS: readonly { href: string; key: keyof Messages["more"]["links"]; group: Group; managers?: boolean; when?: (o: Offers & { keeps_rota: boolean }) => boolean }[] = [
  { href: "/app/bills", key: "bills", group: "daily" },
  { href: "/app/appointments", key: "appointments", group: "daily", when: (o) => o.offers_appointments },
  { href: "/app/more/intake", key: "intake", group: "daily" },
  { href: "/app/more/house", key: "house", group: "daily" },
  { href: "/app/kitchen", key: "kitchen", group: "daily", when: (o) => o.offers_kitchen },
  { href: "/app/food", key: "food", group: "daily", when: (o) => o.offers_food_delivery },
  { href: "/app/shop", key: "shop", group: "daily", when: (o) => o.offers_shop },
  { href: "/app/more/orders", key: "orders", group: "daily", when: (o) => o.offers_kitchen || o.offers_shop },
  { href: "/app/more/reports", key: "reports", group: "money", managers: true },
  { href: "/app/more/expenses", key: "expenses", group: "money", managers: true },
  { href: "/app/more/history", key: "history", group: "money", managers: true },
  { href: "/app/more/people", key: "people", group: "team" },
  { href: "/app/more/rota", key: "rota", group: "team", when: (o) => o.keeps_rota },
  { href: "/app/more/leave", key: "leave", group: "team", when: (o) => o.keeps_rota },
  { href: "/app/more/attendance", key: "attendance", group: "team", when: (o) => o.keeps_rota },
  { href: "/app/more/alerts", key: "alerts", group: "team" },
  { href: "/app/more/settings", key: "settings", group: "setup" },
  { href: "/app/more/kennels", key: "kennels", group: "setup" },
  { href: "/app/more/routines", key: "routines", group: "setup" },
  { href: "/app/more/play", key: "play", group: "setup" },
  { href: "/app/more/extras", key: "extras", group: "setup" },
  { href: "/app/more/peak", key: "peak", group: "setup" },
  { href: "/app/more/cancellation", key: "cancellation", group: "setup" },
  { href: "/app/more/health", key: "health", group: "setup" },
  { href: "/app/more/areas", key: "areas", group: "setup", when: (o) => o.offers_food_delivery },
  { href: "/app/more/appointments", key: "appointmentSetup", group: "setup", when: (o) => o.offers_appointments },
  { href: "/app/more/import", key: "import", group: "upkeep", managers: true },
  { href: "/app/more/photos", key: "photos", group: "upkeep", managers: true },
  { href: "/app/more/problems", key: "problems", group: "upkeep", managers: true },
];
const GROUPS: readonly Group[] = ["daily", "money", "team", "setup", "upkeep"];

export default function MorePage({ searchParams }: PageProps<"/app/more">) {
  return (
    <>
      <Suspense fallback={<Loading />}>
        <Menu searchParams={searchParams} />
      </Suspense>
      <div className="mt-8">
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
      {GROUPS.map((group) => {
        const links = LINKS.filter((l) => l.group === group && (canManage || !l.managers) && (!l.when || l.when(org)));
        return links.length === 0 ? null : (
          <Section key={group} title={m.more.groups[group]}>
            <Ledger>
              {links.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="block px-4 py-4 hover:bg-ground">
                    <span className="block text-lg font-bold">{m.more.links[l.key].title}</span>
                    <span className="block text-slate">{m.more.links[l.key].about}</span>
                  </Link>
                </li>
              ))}
            </Ledger>
          </Section>
        );
      })}
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
