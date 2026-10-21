import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Loading, Notice, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { turnOffTwoStep } from "./actions";
import { RecoveryCodes } from "./recovery";
import { TwoStepSetupForm } from "./setup";

export const generateMetadata = () => appTitle((m) => m.twoStep.title);

/** Two-step sign-in for the person signed in (roadmap M9). Each person's own; any role. */
export default function TwoStepPage() {
  return (
    <Suspense fallback={<Loading />}>
      <TwoStep />
    </Suspense>
  );
}

async function TwoStep() {
  await requireOrg();
  const { m, language } = await getAppI18n();
  const w = m.twoStep;
  const supabase = await createClient();
  const [{ data }, level, left] = await Promise.all([
    supabase.auth.mfa.listFactors(),
    supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    supabase.rpc("recovery_codes_left"),
  ]);
  const on = (data?.totp ?? []).some((f) => f.status === "verified");
  // Signed in with two-step on but without the app's code: the session used a recovery code (D43).
  const recovered = on && level.data?.currentLevel === "aal1";
  const codesLeft = left.data ?? 0;
  return (
    <>
      <PageTitle title={w.title} />
      <p className="mb-4 text-lg">{w.about}</p>
      {on ? (
        recovered ? (
          <div className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <Notice tone="info">{w.recovery.usedOne}</Notice>
            <p>{w.recovery.newPhone}</p>
            <p className="text-slate">{codesLeft > 0 ? plural(language, codesLeft, w.recovery.left) : w.recovery.none}</p>
          </div>
        ) : (
          <>
            <div className="mb-6 space-y-4 rounded-xl border border-rule bg-paper p-4">
              <Notice tone="ok">{w.isOn}</Notice>
              <p className="text-slate">{w.lostPhoneNote}</p>
              <ActionForm action={turnOffTwoStep}>
                <SubmitButton variant="secondary" pendingLabel={w.turningOff}>
                  {w.turnOff}
                </SubmitButton>
              </ActionForm>
            </div>
            <section className="space-y-3 rounded-xl border border-rule bg-paper p-4">
              <h2 className="text-lg font-bold">{w.recovery.title}</h2>
              <p>{w.recovery.about}</p>
              <RecoveryCodes words={w.recovery} copy={m.copy} left={codesLeft > 0 ? plural(language, codesLeft, w.recovery.left) : w.recovery.none} any={codesLeft > 0} />
            </section>
          </>
        )
      ) : (
        <div className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <p className="font-semibold">{w.isOff}</p>
          <TwoStepSetupForm words={w} />
        </div>
      )}
    </>
  );
}
