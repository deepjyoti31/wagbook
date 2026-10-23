import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Empty, Field, Input, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { TALLY_FIELDS, tallyLedgers } from "@/lib/tally";
import { saveTallyLedgers } from "./actions";

export const generateMetadata = () => appTitle((m) => m.tally.ledgers);

export default function TallyPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TallyLedgers />
    </Suspense>
  );
}

/** The ledger names in Tally, set once (M64). Owners and managers. */
async function TallyLedgers() {
  const { org, canManage } = await requireOrg();
  const { m } = await getAppI18n();
  const w = m.tally;
  const title = (
    <PageTitle title={w.ledgers}>
      <Link href="/app/more/reports" className={buttonStyles.quiet}>
        {m.reports.title}
      </Link>
    </PageTitle>
  );
  if (!canManage)
    return (
      <>
        {title}
        <Empty>{w.managersOnly}</Empty>
      </>
    );
  const ledgers = await tallyLedgers(await createClient(), org.id);
  if (!ledgers) throw new Error("Could not load the ledger names.");
  return (
    <>
      {title}
      <p className="mb-4 text-slate">{w.settingsAbout}</p>
      <ActionForm action={saveTallyLedgers} className="grid gap-4 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-2">
        <div className="sm:col-span-2">
          <Field label={w.company} hint={w.companyHint}>
            <Input name="company" maxLength={100} defaultValue={ledgers.company ?? ""} autoComplete="off" />
          </Field>
        </div>
        {TALLY_FIELDS.map(([column, key]) => (
          <Field key={column} label={w.names[key]}>
            <Input name={column} required maxLength={100} defaultValue={ledgers[key]} autoComplete="off" />
          </Field>
        ))}
        <div className="sm:col-span-2">
          <SubmitButton pendingLabel={m.common.saving}>{w.save}</SubmitButton>
        </div>
      </ActionForm>
    </>
  );
}
