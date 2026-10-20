import type { Metadata } from "next";
import { ForgetOfflineCopies } from "@/components/forget-offline-copies";
import { HtmlLang } from "@/components/html-lang";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Rich } from "@/components/rich";
import { Field, Input, Loading } from "@/components/ui";
import { getVisitorI18n } from "@/lib/i18n-server";
import { signIn, signUp } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getVisitorI18n()).m.auth.title };
}

export default function LoginPage({ searchParams }: PageProps<"/login">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <Suspense fallback={<Loading />}>
        <LoginForm searchParams={searchParams} />
      </Suspense>
    </main>
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
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">{signup ? a.signUpHeading : a.signInHeading}</h1>
      {params.error === "link" ? (
        <p role="alert" className="mb-4 rounded-lg bg-alert-soft px-4 py-3 font-semibold text-alert">
          {a.linkExpired}
        </p>
      ) : null}
      {next?.startsWith("/join/") ? <p className="mb-4 rounded-lg bg-marigold-soft px-4 py-3">{signup ? a.invitedSignUp : a.invitedSignIn}</p> : null}
      <ActionForm action={signup ? signUp : signIn}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label={a.email}>
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label={a.password} hint={signup ? a.passwordHint : undefined}>
          <Input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={8} />
        </Field>
        <SubmitButton pendingLabel={signup ? a.creatingAccount : a.signingIn} className="w-full">
          {signup ? a.createAccount : a.signIn}
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-slate">
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
