import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Loading, Notice, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { changePassword } from "./actions";

export const generateMetadata = () => appTitle((m) => m.account.change.title);

/** Change one's own password (M45). Each person's own; any role. */
export default function PasswordPage() {
  return (
    <Suspense fallback={<Loading />}>
      <ChangePassword />
    </Suspense>
  );
}

async function ChangePassword() {
  await requireOrg();
  const { m } = await getAppI18n();
  const w = m.account.change;
  // Someone who only ever signed in with Google has no password to change.
  const { data } = await (await createClient()).auth.getUser();
  const hasPassword = (data.user?.identities ?? []).some((i) => i.provider === "email");
  return (
    <>
      <PageTitle title={w.title} />
      {hasPassword ? (
        <>
          <p className="mb-4 text-lg">{w.intro}</p>
          <ActionForm action={changePassword} className="space-y-4 rounded-xl border border-rule bg-paper p-4">
            <Field label={w.current}>
              <Input name="current" type="password" autoComplete="current-password" required maxLength={72} />
            </Field>
            <Field label={w.next} hint={m.auth.passwordHint}>
              <Input name="next" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
            </Field>
            <SubmitButton pendingLabel={w.saving}>{w.save}</SubmitButton>
          </ActionForm>
        </>
      ) : (
        <Notice tone="info">{w.googleOnly}</Notice>
      )}
    </>
  );
}
