import type { Metadata } from "next";
import { HtmlLang } from "@/components/html-lang";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Rich } from "@/components/rich";
import { Field, Input, Loading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getVisitorI18n, type I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { createOrganization, respondToInvitation } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getVisitorI18n()).m.onboarding.title };
}

export default function OnboardingPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <Suspense fallback={<Loading />}>
        <OnboardingForm />
      </Suspense>
    </main>
  );
}

async function OnboardingForm() {
  await requireUser();
  const { m, language } = await getVisitorI18n();
  const o = m.onboarding;
  const supabase = await createClient();
  const { data: invitations } = await supabase.rpc("my_invitations");
  return (
    <>
      <HtmlLang lang={language} />
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight">{o.title}</h1>
      <p className="mb-6 text-slate">{o.intro}</p>
      {invitations && invitations.length > 0 ? (
        <div className="mb-8 rounded-xl border-2 border-marigold bg-paper p-4">
          <p className="mb-3 text-lg font-bold">{o.invited}</p>
          <ul className="space-y-4">
            {invitations.map((inv) => (
              <li key={inv.org_id}>
                <p>
                  <Rich text={o.joinAs[inv.role]} parts={{ kennel: <strong>{inv.org_name}</strong> }} />
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionForm action={respondToInvitation} className="contents">
                    <input type="hidden" name="orgId" value={inv.org_id} />
                    <input type="hidden" name="accept" value="true" />
                    <SubmitButton pendingLabel={o.joining}>{o.join}</SubmitButton>
                  </ActionForm>
                  <ActionForm action={respondToInvitation} className="contents">
                    <input type="hidden" name="orgId" value={inv.org_id} />
                    <input type="hidden" name="accept" value="false" />
                    <SubmitButton variant="quiet" pendingLabel={o.declining}>
                      {o.decline}
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-slate">{o.orOwn}</p>
        </div>
      ) : null}
      <CreateForm m={m} />
    </>
  );
}

function CreateForm({ m }: { m: I18n["m"] }) {
  const o = m.onboarding;
  return (
    <ActionForm action={createOrganization}>
      <Field label={o.kennelName} hint={o.kennelNameHint}>
        <Input name="name" required minLength={2} maxLength={80} autoComplete="organization" />
      </Field>
      <Field label={o.linkName} hint={o.linkNameHint}>
        <Input name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" autoCapitalize="none" spellCheck={false} />
      </Field>
      <Field label={o.yourName} hint={o.yourNameHint}>
        <Input name="displayName" required maxLength={80} autoComplete="name" />
      </Field>
      <SubmitButton pendingLabel={o.creating} className="w-full">
        {o.create}
      </SubmitButton>
    </ActionForm>
  );
}
