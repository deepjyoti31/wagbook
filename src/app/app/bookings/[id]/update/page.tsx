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
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n, parentI18n } from "@/lib/i18n-server";
import { signedUrls } from "@/lib/media";
import { siteOrigin } from "@/lib/site";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.update.title);

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
  const { m } = await getAppI18n();
  const w = m.update;
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
  // The WhatsApp message goes to the parent, so it is in the kennel's language for parents.
  const toParent = parentI18n(org.parent_language, org.locale).m.whatsapp;

  return (
    <>
      <PageTitle title={update ? w.saved : pet?.name ? fill(w.for, { pet: pet.name }) : w.forParent}>
        <Link href={`/app/bookings/${id}`} className={buttonStyles.quiet}>
          {w.back}
        </Link>
      </PageTitle>

      <div className="mb-5 flex items-center gap-3">
        <PetAvatar name={pet?.name ?? "?"} url={pet?.photo_path ? urls.get(pet.photo_path) : null} />
        <p className="text-lg font-bold">{pet?.name}</p>
      </div>

      {update ? (
        <div className="space-y-4">
          <Notice tone="ok">{update.is_visible_to_parent ? w.savedVisible : w.savedTeam}</Notice>
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
                href={whatsappLink(dailyUpdateMessage(toParent, { petName: pet?.name ?? toParent.yourPet, note: update.body, stayUrl }), b.data.clients.phone)}
                target="_blank"
                rel="noreferrer"
                className={`${buttonStyles.whatsapp} w-full`}
              >
                {m.common.sendOnWhatsapp}
              </a>
              <p className="text-sm text-slate">{w.whatsappNote}</p>
            </>
          ) : null}
          <Link href={`/app/bookings/${id}/update`} className={buttonStyles.secondary}>
            {w.another}
          </Link>
        </div>
      ) : (
        <ActionForm action={createUpdate}>
          <input type="hidden" name="bookingId" value={id} />
          <Field label={w.how}>
            <Textarea name="body" required maxLength={2000} rows={4} placeholder={w.placeholder} />
          </Field>
          <PhotoInput name="photos" label={w.photos} words={m.photos} multiple max={4} />
          <label className="flex min-h-12 items-center gap-3">
            <input type="checkbox" name="visible" defaultChecked className="size-5" />
            <span>{w.showToParent}</span>
          </label>
          <SubmitButton pendingLabel={m.common.saving}>{w.save}</SubmitButton>
        </ActionForm>
      )}
    </>
  );
}
