import type { Metadata } from "next";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Field, Input, Loading } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createOrganization, respondToInvitation } from "./actions";

export const metadata: Metadata = { title: "Set up your kennel" };

export default function OnboardingPage() {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <h1 className="mb-2 text-3xl font-extrabold tracking-tight">Set up your kennel</h1>
      <p className="mb-6 text-slate">Three details now. Everything else can wait until you need it.</p>
      <Suspense fallback={<Loading />}>
        <OnboardingForm />
      </Suspense>
    </main>
  );
}

async function OnboardingForm() {
  await requireUser();
  const supabase = await createClient();
  const { data: invitations } = await supabase.rpc("my_invitations");
  return (
    <>
      {invitations && invitations.length > 0 ? (
        <div className="mb-8 rounded-xl border-2 border-marigold bg-paper p-4">
          <p className="mb-3 text-lg font-bold">You have been invited</p>
          <ul className="space-y-4">
            {invitations.map((inv) => (
              <li key={inv.org_id}>
                <p>
                  Join <strong>{inv.org_name}</strong> as {inv.role === "owner" ? "an owner" : inv.role === "manager" ? "a manager" : "staff"}.
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <ActionForm action={respondToInvitation} className="contents">
                    <input type="hidden" name="orgId" value={inv.org_id} />
                    <input type="hidden" name="accept" value="true" />
                    <SubmitButton pendingLabel="Joining">Join</SubmitButton>
                  </ActionForm>
                  <ActionForm action={respondToInvitation} className="contents">
                    <input type="hidden" name="orgId" value={inv.org_id} />
                    <input type="hidden" name="accept" value="false" />
                    <SubmitButton variant="quiet" pendingLabel="Declining">
                      Decline
                    </SubmitButton>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-slate">Or set up a kennel of your own below.</p>
        </div>
      ) : null}
      <CreateForm />
    </>
  );
}

function CreateForm() {
  return (
    <ActionForm action={createOrganization}>
      <Field label="Kennel name" hint="As parents know it.">
        <Input name="name" required minLength={2} maxLength={80} autoComplete="organization" />
      </Field>
      <Field label="Link name" hint="Used in the link you send to parents, like yoursite/i/happy-tails. Lower case letters, numbers and hyphens.">
        <Input name="slug" required pattern="[a-z0-9][a-z0-9\-]{1,38}[a-z0-9]" autoCapitalize="none" spellCheck={false} />
      </Field>
      <Field label="Your name" hint="Shown next to things you do, like check-ins.">
        <Input name="displayName" required maxLength={80} autoComplete="name" />
      </Field>
      <SubmitButton pendingLabel="Creating" className="w-full">
        Create kennel
      </SubmitButton>
    </ActionForm>
  );
}
