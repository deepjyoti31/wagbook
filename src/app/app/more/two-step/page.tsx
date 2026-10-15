import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Loading, Notice, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { turnOffTwoStep } from "./actions";
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
  const { m } = await getAppI18n();
  const w = m.twoStep;
  const supabase = await createClient();
  const { data } = await supabase.auth.mfa.listFactors();
  const on = (data?.totp ?? []).some((f) => f.status === "verified");
  return (
    <>
      <PageTitle title={w.title} />
      <p className="mb-4 text-lg">{w.about}</p>
      {on ? (
        <div className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <Notice tone="ok">{w.isOn}</Notice>
          <p className="text-slate">{w.lostPhoneNote}</p>
          <ActionForm action={turnOffTwoStep}>
            <SubmitButton variant="secondary" pendingLabel={w.turningOff}>
              {w.turnOff}
            </SubmitButton>
          </ActionForm>
        </div>
      ) : (
        <div className="space-y-4 rounded-xl border border-rule bg-paper p-4">
          <p className="font-semibold">{w.isOff}</p>
          <TwoStepSetupForm words={w} />
        </div>
      )}
    </>
  );
}
