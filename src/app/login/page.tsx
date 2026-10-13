import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Loading } from "@/components/ui";
import { signIn, signUp } from "./actions";

export const metadata: Metadata = { title: "Sign in" };

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
  const signup = params.mode === "signup";
  return (
    <>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">{signup ? "Create your account" : "Sign in to Wagbook"}</h1>
      {params.error === "link" ? (
        <p role="alert" className="mb-4 rounded-lg bg-alert-soft px-4 py-3 font-semibold text-alert">
          That link has expired or was already used. Sign in, or ask for a new one.
        </p>
      ) : null}
      <ActionForm action={signup ? signUp : signIn}>
        <Field label="Email">
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <Field label="Password" hint={signup ? "At least 8 characters." : undefined}>
          <Input name="password" type="password" autoComplete={signup ? "new-password" : "current-password"} required minLength={8} />
        </Field>
        <SubmitButton pendingLabel={signup ? "Creating account" : "Signing in"} className="w-full">
          {signup ? "Create account" : "Sign in"}
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-slate">
        {signup ? "Already have an account? " : "New to Wagbook? "}
        <Link href={signup ? "/login" : "/login?mode=signup"} className="font-semibold text-ink underline underline-offset-4">
          {signup ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </>
  );
}
