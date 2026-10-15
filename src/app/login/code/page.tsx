import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { HtmlLang } from "@/components/html-lang";
import { buttonStyles, Field, Input, Loading } from "@/components/ui";
import { getUser, owesCode } from "@/lib/auth";
import { getVisitorI18n } from "@/lib/i18n-server";
import { signOut } from "../actions";
import { verifyCode } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getVisitorI18n()).m.auth.code.title };
}

export default function CodePage({ searchParams }: PageProps<"/login/code">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <Suspense fallback={<Loading />}>
        <CodeForm searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function CodeForm({ searchParams }: Pick<PageProps<"/login/code">, "searchParams">) {
  const params = await searchParams;
  if (!(await getUser())) redirect("/login");
  // Someone fully signed in has nothing to do here. (A session that the
  // cookie says is fine but the database does not, after two-step sign-in
  // was turned on elsewhere, still gets the form.)
  if (!(await owesCode()) && params.check !== "1") redirect("/app");
  const { m, language } = await getVisitorI18n();
  const w = m.auth.code;
  const next = typeof params.next === "string" && params.next.startsWith("/") ? params.next : null;
  return (
    <>
      <HtmlLang lang={language} />
      <h1 className="mb-3 text-3xl font-extrabold tracking-tight">{w.title}</h1>
      <p className="mb-6 text-lg text-slate">{w.intro}</p>
      <ActionForm action={verifyCode}>
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <Field label={w.label}>
          <Input name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9 ]{6,7}" maxLength={7} required autoFocus />
        </Field>
        <SubmitButton pendingLabel={w.checking} className="w-full">
          {w.continue}
        </SubmitButton>
      </ActionForm>
      <p className="mt-6 text-slate">{w.lostPhone}</p>
      <form action={signOut} className="mt-4">
        <button type="submit" className={buttonStyles.quiet}>
          {w.signOut}
        </button>
      </form>
    </>
  );
}
