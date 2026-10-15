import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { Rich } from "@/components/rich";
import { buttonStyles, Loading, Notice } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { fill } from "@/lib/i18n";
import { getVisitorI18n } from "@/lib/i18n-server";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import type { Messages } from "@/messages";
import { joinWithLink } from "./actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: (await getVisitorI18n()).m.join.title, robots: { index: false } };
}

/**
 * Where an invitation link lands. Someone not signed in is asked to create an
 * account or sign in, and comes back here. Only then does the page say which
 * kennel it is for: a signed-out visitor learns nothing from a link.
 */
export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <Suspense fallback={<Loading />}>
        <Join params={params} />
      </Suspense>
    </main>
  );
}

async function Join({ params }: Pick<PageProps<"/join/[token]">, "params">) {
  const { token } = await params;
  if (!isSupabaseConfigured() || !/^[0-9a-f]{64}$/.test(token)) notFound();
  const here = encodeURIComponent(`/join/${token}`);
  const { m } = await getVisitorI18n();
  const j = m.join;
  return (
    <>
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">{j.title}</h1>
      <JoinBody token={token} here={here} j={j} />
    </>
  );
}

async function JoinBody({ token, here, j }: { token: string; here: string; j: Messages["join"] }) {
  const user = await getUser();
  if (!user) {
    return (
      <div className="space-y-4">
        <p className="text-lg">{j.invited}</p>
        <Link href={`/login?mode=signup&next=${here}`} className={`${buttonStyles.primary} w-full`}>
          {j.createAccount}
        </Link>
        <Link href={`/login?next=${here}`} className={`${buttonStyles.secondary} w-full`}>
          {j.haveAccount}
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation_link", { p_token: token });
  const link = data?.[0];
  if (!link || !link.usable) {
    return <Notice tone="error">{j.expired}</Notice>;
  }
  if (link.already_member) {
    return (
      <div className="space-y-4">
        <Notice tone="info">{fill(j.alreadyMember, { kennel: link.org_name })}</Notice>
        <Link href="/app" className={buttonStyles.primary}>
          {j.goToApp}
        </Link>
      </div>
    );
  }
  return (
    <ActionForm action={joinWithLink}>
      <input type="hidden" name="token" value={token} />
      <p className="text-lg">
        <Rich text={j.confirm[link.role]} parts={{ kennel: <strong>{link.org_name}</strong>, name: link.display_name }} />
      </p>
      <p className="text-slate">{fill(j.signedInAs, { email: user.email ?? j.you })}</p>
      <SubmitButton pendingLabel={j.joining} className="w-full">
        {fill(j.join, { kennel: link.org_name })}
      </SubmitButton>
    </ActionForm>
  );
}
