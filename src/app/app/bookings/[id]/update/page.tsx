import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ActionForm, SubmitButton } from "@/components/action-form";
import { PetAvatar } from "@/components/pet-avatar";
import { PhotoInput } from "@/components/photo-input";
import { buttonStyles, Field, Loading, Notice, PageTitle, Textarea } from "@/components/ui";
import { createUpdate } from "@/app/app/media/actions";
import { requireOrg } from "@/lib/auth";
import { dailyUpdateMessage, whatsappLink } from "@/lib/core";
import { signedUrls } from "@/lib/media";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Write an update" };

export default function UpdatePage({ params, searchParams }: PageProps<"/app/bookings/[id]/update">) {
  return (
    <Suspense fallback={<Loading />}>
      <Update params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function Update({ params, searchParams }: Pick<PageProps<"/app/bookings/[id]/update">, "params" | "searchParams">) {
  const { id } = await params;
  const saved = (await searchParams).saved;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const { org } = await requireOrg();
  const supabase = await createClient();
  const b = await supabase
    .from("bookings")
    .select("id, status, public_token, pets(name, photo_path), clients(full_name, phone)")
    .eq("org_id", org.id)
    .eq("id", id)
    .maybeSingle();
  if (b.error) throw new Error("Could not load the booking.");
  if (!b.data) notFound();
  const pet = b.data.pets;
  const stayUrl = `${(await siteOrigin())}/s/${b.data.public_token}`;

  const update =
    typeof saved === "string" && /^[0-9a-f-]{36}$/.test(saved)
      ? (await supabase.from("stay_updates").select("id, body, media_paths, is_visible_to_parent").eq("org_id", org.id).eq("id", saved).maybeSingle()).data
      : null;
  const urls = await signedUrls(supabase, [pet?.photo_path, ...(update?.media_paths ?? [])], { small: true });

  return (
    <>
      <PageTitle title={update ? "Update saved" : `Update for ${pet?.name ?? "the parent"}`}>
        <Link href={`/app/bookings/${id}`} className={buttonStyles.quiet}>
          Back to the booking
        </Link>
      </PageTitle>

      <div className="mb-5 flex items-center gap-3">
        <PetAvatar name={pet?.name ?? "?"} url={pet?.photo_path ? urls.get(pet.photo_path) : null} />
        <p className="text-lg font-bold">{pet?.name}</p>
      </div>

      {update ? (
        <div className="space-y-4">
          <Notice tone="ok">
            {update.is_visible_to_parent ? "Saved. It is on the parent's stay page now." : "Saved as a note for the team. The parent does not see it."}
          </Notice>
          <p className="whitespace-pre-line rounded-xl border border-rule bg-paper p-4">{update.body}</p>
          {update.media_paths.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {update.media_paths.map((p) =>
                urls.get(p) ? (
                  // eslint-disable-next-line @next/next/no-img-element -- a short-lived signed link to a private file
                  <img key={p} src={urls.get(p)} alt="" className="size-24 rounded-lg object-cover" />
                ) : null,
              )}
            </div>
          ) : null}
          {update.is_visible_to_parent && b.data.clients ? (
            <>
              <a
                href={whatsappLink(dailyUpdateMessage({ petName: pet?.name ?? "Your pet", note: update.body, stayUrl }), b.data.clients.phone)}
                target="_blank"
                rel="noreferrer"
                className={`${buttonStyles.whatsapp} w-full`}
              >
                Send on WhatsApp
              </a>
              <p className="text-sm text-slate">
                The message has the stay link, where the parent sees the photos. To send a photo in the chat as well, attach it in WhatsApp.
              </p>
            </>
          ) : null}
          <Link href={`/app/bookings/${id}/update`} className={buttonStyles.secondary}>
            Write another
          </Link>
        </div>
      ) : (
        <ActionForm action={createUpdate}>
          <input type="hidden" name="bookingId" value={id} />
          <Field label="How is the pet doing?">
            <Textarea name="body" required maxLength={2000} rows={4} placeholder="Ate all his breakfast and had a long run in Yard A." />
          </Field>
          <PhotoInput name="photos" label="Photos" multiple max={4} />
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" name="visible" defaultChecked className="size-5" />
            <span>Show to the parent</span>
          </label>
          <SubmitButton pendingLabel="Saving">Save update</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}
