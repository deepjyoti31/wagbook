import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { buttonStyles, Loading, Notice } from "@/components/ui";
import { getUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { createClient } from "@/lib/supabase/server";
import { joinWithLink } from "./actions";

export const metadata: Metadata = { title: "Join a kennel", robots: { index: false } };

const ROLE = { owner: "an owner", manager: "a manager", staff: "staff" } as const;

/**
 * Where an invitation link lands. Someone not signed in is asked to create an
 * account or sign in, and comes back here. Only then does the page say which
 * kennel it is for: a signed-out visitor learns nothing from a link.
 */
export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <main className="mx-auto w-full max-w-md flex-1 px-5 py-12">
      <h1 className="mb-6 text-3xl font-extrabold tracking-tight">Join a kennel</h1>
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

  const user = await getUser();
  if (!user) {
    return (
      <div className="space-y-4">
        <p className="text-lg">You have been invited to work at a kennel that uses Wagbook.</p>
        <Link href={`/login?mode=signup&next=${here}`} className={`${buttonStyles.primary} w-full`}>
          Create an account
        </Link>
        <Link href={`/login?next=${here}`} className={`${buttonStyles.secondary} w-full`}>
          I already have an account
        </Link>
      </div>
    );
  }

  const supabase = await createClient();
  const { data } = await supabase.rpc("get_invitation_link", { p_token: token });
  const link = data?.[0];
  if (!link || !link.usable) {
    return <Notice tone="error">This invitation link has expired, was already used, or was withdrawn. Ask the kennel for a new one.</Notice>;
  }
  if (link.already_member) {
    return (
      <div className="space-y-4">
        <Notice tone="info">You already work at {link.org_name}.</Notice>
        <Link href="/app" className={buttonStyles.primary}>
          Go to Wagbook
        </Link>
      </div>
    );
  }
  return (
    <ActionForm action={joinWithLink}>
      <input type="hidden" name="token" value={token} />
      <p className="text-lg">
        Join <strong>{link.org_name}</strong> as {ROLE[link.role]}, under the name {link.display_name}?
      </p>
      <p className="text-slate">Signed in as {user.email ?? "you"}.</p>
      <SubmitButton pendingLabel="Joining" className="w-full">
        Join {link.org_name}
      </SubmitButton>
    </ActionForm>
  );
}
