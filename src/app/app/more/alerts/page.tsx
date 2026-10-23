import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { AlertsPhone } from "@/components/alerts-phone";
import { Loading, Notice, PageTitle, Section } from "@/components/ui";
import { ALERT_KINDS } from "@/lib/alerts";
import { requireOrg } from "@/lib/auth";
import { plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { vapidPublicKey } from "@/lib/push";
import { createClient } from "@/lib/supabase/server";
import { saveAlertChoices } from "./actions";

export const generateMetadata = () => appTitle((m) => m.alerts.title);

/** Alerts on staff phones (M61): which alerts this person wants, and this phone on or off. */
export default function AlertsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Alerts />
    </Suspense>
  );
}

async function Alerts() {
  const { org, user } = await requireOrg();
  const { m, language } = await getAppI18n();
  const w = m.alerts;
  const publicKey = vapidPublicKey();
  const supabase = await createClient();
  const [choices, phones] = await Promise.all([
    supabase.from("alert_choices").select("kind").eq("org_id", org.id).eq("user_id", user.id),
    supabase.from("push_subscriptions").select("id", { count: "exact", head: true }).eq("org_id", org.id).eq("user_id", user.id),
  ]);
  if (choices.error) throw new Error("Could not load your alerts.");
  const chosen = new Set(choices.data.map((c) => c.kind));
  // Someone choosing for the first time starts with everything ticked.
  const fresh = choices.data.length === 0;

  return (
    <>
      <PageTitle title={w.title} />
      <p className="mb-5 text-slate">{w.about}</p>
      {publicKey ? (
        <Section title={w.phone}>
          <AlertsPhone publicKey={publicKey} words={w} />
          {(phones.count ?? 0) > 0 ? <p className="mt-2 text-sm text-slate">{plural(language, phones.count ?? 0, w.phones)}</p> : null}
        </Section>
      ) : (
        <Notice tone="info">{w.notSetUp}</Notice>
      )}
      <Section title={w.choose}>
        <ActionForm action={saveAlertChoices} className="space-y-3 rounded-xl border border-rule bg-paper p-4">
          <div className="space-y-1">
            {ALERT_KINDS.map((k) => (
              <label key={k} className="flex min-h-12 items-center gap-3">
                <input type="checkbox" name={k} defaultChecked={fresh || chosen.has(k)} className="size-5" />
                <span>{w.kinds[k]}</span>
              </label>
            ))}
          </div>
          <SubmitButton variant="secondary" pendingLabel={m.common.saving}>
            {w.save}
          </SubmitButton>
        </ActionForm>
      </Section>
    </>
  );
}
