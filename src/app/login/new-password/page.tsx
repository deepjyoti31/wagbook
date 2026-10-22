import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { HtmlLang } from "@/components/html-lang";
import { Field, Input, Loading } from "@/components/ui";
import { getUser, owesCode } from "@/lib/auth";
import { fill } from "@/lib/i18n";
import { getVisitorI18n } from "@/lib/i18n-server";
import { madeByResetLink } from "@/lib/core";
import { createClient } from "@/lib/supabase/server";
import { setNewPassword } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getVisitorI18n()).m.account.newPassword.title };
}

/**
 * Where the emailed reset link ends (M45): /auth/confirm has signed the person
 * in, and here they choose the new password. With two-step sign-in on, Supabase
 * Auth asks for the code first, so the code page comes before this one.
 */
export default function NewPasswordPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <Suspense fallback={<Loading />}>
        <NewPasswordForm />
      </Suspense>
    </main>
  );
}

async function NewPasswordForm() {
  const { m, language } = await getVisitorI18n();
  const w = m.account.newPassword;
  const signedIn = await getUser();
  if (signedIn && (await owesCode())) redirect(`/login/code?next=${encodeURIComponent("/login/new-password")}`);
  // Only a session the emailed link made, within the hour (madeByResetLink).
  const { data } = await (await createClient()).auth.getClaims();
  const user = signedIn && madeByResetLink(data?.claims) ? signedIn : null;
  return (
    <>
      <HtmlLang lang={language} />
      <h1 className="mb-3 text-3xl font-extrabold tracking-tight">{w.title}</h1>
      {user ? (
        <>
          <p className="mb-6 text-lg text-slate">{fill(w.intro, { email: user.email ?? m.more.noEmail })}</p>
          <ActionForm action={setNewPassword}>
            <Field label={w.label} hint={m.auth.passwordHint}>
              <Input name="password" type="password" autoComplete="new-password" required minLength={8} maxLength={72} />
            </Field>
            <SubmitButton pendingLabel={w.saving} className="w-full">
              {w.save}
            </SubmitButton>
          </ActionForm>
        </>
      ) : (
        <>
          <p role="alert" className="mb-4 rounded-lg bg-alert-soft px-4 py-3 font-semibold text-alert">
            {w.expired}
          </p>
          <Link href="/login/forgot" className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
            {w.askAgain}
          </Link>
        </>
      )}
    </>
  );
}
