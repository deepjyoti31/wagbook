import type { Metadata } from "next";
import { AuthShell } from "@/components/auth-shell";
import { ForgetOfflineCopies } from "@/components/forget-offline-copies";
import { HtmlLang } from "@/components/html-lang";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Rich } from "@/components/rich";
import { PasswordInput } from "@/components/password-input";
import { buttonStyles, Field, Input, Loading } from "@/components/ui";
import { getVisitorI18n } from "@/lib/i18n-server";
import { googleSignInOn } from "@/lib/site";
import { signIn, signUp } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getVisitorI18n()).m.auth.title };
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <AuthShell>
      <Suspense fallback={<Loading />}>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </AuthShell>
  );
}

async function LoginForm({ searchParams }: Pick<PageProps<"/login">, "searchParams">) {
  const params = await searchParams;
  const { m, language } = await getVisitorI18n();
  const a = m.auth;
  const signup = params.mode === "signup";
  // Where to go afterwards, such as an invitation link. Checked again on the server (safeDestination).
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : null;
  const keep = next ? `&next=${encodeURIComponent(next)}` : "";
  return (
    <>
      <HtmlLang lang={language} />
      <ForgetOfflineCopies />
      <h1 className="mb-[18px] text-[30px] font-extrabold leading-tight tracking-[-0.02em]">{signup ? a.signUpHeading : a.signInHeading}</h1>
      {params.error === "link" ? (
        <p role="alert" className="mb-4 rounded-xl bg-alert-soft px-4 py-3 font-semibold text-alert-ink">
          {a.linkExpired}
        </p>
      ) : null}
      {params.error === "google" ? (
        <p role="alert" className="mb-4 rounded-xl bg-alert-soft px-4 py-3 font-semibold text-alert-ink">
          {m.account.google.failed}
        </p>
      ) : null}
      {next?.startsWith("/join/") ? <p className="mb-[18px] rounded-xl bg-marigold-soft px-3.5 py-3 text-[15px] text-[#3d2a00]">{signup ? a.invitedSignUp : a.invitedSignIn}</p> : null}
      {googleSignInOn() ? (
        <>
          {/* A plain link: the route sends the browser on to Google (src/app/auth/google/route.ts). */}
          <a href={`/auth/google${next ? `?next=${encodeURIComponent(next)}` : ""}`} className={`${buttonStyles.secondary} w-full`}>
            {m.account.google.continue}
          </a>
          <p className="my-4 text-center text-slate">{m.account.google.or}</p>
        </>
      ) : null}
      <ActionForm action={signup ? signUp : signIn}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label={a.email}>
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={a.password} hint={signup ? a.passwordHint : undefined}>
          <PasswordInput name="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={8} words={{ show: a.show, hide: a.hide }} />
        </Field>
        {signup ? null : (
          <p className="-mt-2.5!">
            <Link href="/login/forgot" className="inline-flex min-h-11 items-center text-[15px] font-semibold underline underline-offset-4">
              {m.account.forgotLink}
            </Link>
          </p>
        )}
        <SubmitButton pendingLabel={signup ? a.creatingAccount : a.signingIn} className="w-full">
          {signup ? a.createAccount : a.signIn}
        </SubmitButton>
      </ActionForm>
      <p className="mt-[18px] border-t border-rule pt-4 text-center text-[15px]">
        <Rich
          text={signup ? a.haveAccount : a.newHere}
          parts={{
            link: (
              <Link href={signup ? `/login?mode=signin${keep}` : `/login?mode=signup${keep}`} className="font-semibold text-ink underline underline-offset-4">
                {signup ? a.signIn : a.createAnAccount}
              </Link>
            ),
          }}
        />
      </p>
    </>
  );
}
