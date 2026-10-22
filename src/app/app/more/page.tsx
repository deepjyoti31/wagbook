import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Field, Ledger, Loading, Notice, PageTitle, Select } from "@/components/ui";
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
// A link with `when` shows only while the kennel offers that (D44).
const LINKS: readonly { href: string; key: keyof Messages["more"]["links"]; managers?: boolean; when?: (o: Offers) => boolean }[] = [
  { href: "/app/appointments", key: "appointments", when: (o) => o.offers_appointments },
  { href: "/app/kitchen", key: "kitchen", when: (o) => o.offers_kitchen },
  { href: "/app/food", key: "food", when: (o) => o.offers_food_delivery },
  { href: "/app/bills", key: "bills" },
  { href: "/app/more/reports", key: "reports", managers: true },
  { href: "/app/more/expenses", key: "expenses", managers: true },
  { href: "/app/more/intake", key: "intake" },
  { href: "/app/more/kennels", key: "kennels" },
  { href: "/app/more/people", key: "people" },
  { href: "/app/more/routines", key: "routines" },
  { href: "/app/more/play", key: "play" },
  { href: "/app/more/extras", key: "extras" },
  { href: "/app/more/peak", key: "peak" },
  { href: "/app/more/areas", key: "areas", when: (o) => o.offers_food_delivery },
  { href: "/app/more/appointments", key: "appointmentSetup", when: (o) => o.offers_appointments },
  { href: "/app/more/settings", key: "settings" },
  { href: "/app/more/history", key: "history", managers: true },
];

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
      <Ledger>
        {LINKS.filter((l) => (canManage || !l.managers) && (!l.when || l.when(org))).map((l) => (
          <li key={l.href}>
            <Link href={l.href} className="block px-4 py-4 hover:bg-ground">
              <span className="block text-lg font-bold">{m.more.links[l.key].title}</span>
              <span className="block text-slate">{m.more.links[l.key].about}</span>
            </Link>
          </li>
        ))}
      </Ledger>
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
