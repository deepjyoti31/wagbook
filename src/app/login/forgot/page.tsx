import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { HtmlLang } from "@/components/html-lang";
import { Field, Input, Loading } from "@/components/ui";
import { getVisitorI18n } from "@/lib/i18n-server";
import { sendResetLink } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getVisitorI18n()).m.account.forgot.title };
}

/** Ask for a link to choose a new password (M45). */
export default function ForgotPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <Suspense fallback={<Loading />}>
        <ForgotForm />
      </Suspense>
    </main>
  );
}

async function ForgotForm() {
  const { m, language } = await getVisitorI18n();
  const w = m.account.forgot;
  return (
    <>
      <HtmlLang lang={language} />
      <h1 className="mb-3 text-3xl font-extrabold tracking-tight">{w.title}</h1>
      <p className="mb-6 text-lg text-slate">{w.intro}</p>
      <ActionForm action={sendResetLink}>
        <Field label={m.auth.email}>
          <Input name="email" type="email" autoComplete="email" required />
        </Field>
        <SubmitButton pendingLabel={w.sending} className="w-full">
          {w.send}
        </SubmitButton>
      </ActionForm>
      <p className="mt-6">
        <Link href="/login" className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
          {w.back}
        </Link>
      </p>
    </>
  );
}
