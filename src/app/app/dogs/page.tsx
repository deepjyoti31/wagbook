import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonStyles, Empty, Input, Ledger, LedgerRow, Loading, Notice, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { flagText } from "@/lib/bookings";
import { formatKg, formatPhone } from "@/lib/core";
import { fill } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import type { QueryData } from "@supabase/supabase-js";
import { PetAvatar } from "@/components/pet-avatar";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.pets.title);

export default function PetsPage({ searchParams }: PageProps<"/app/dogs">) {
  return (
    <Suspense fallback={<Loading />}>
      <Pets searchParams={searchParams} />
    </Suspense>
  );
}

async function Pets({ searchParams }: Pick<PageProps<"/app/dogs">, "searchParams">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  const { org } = await requireOrg();
  const { m, locale } = await getAppI18n();
  const supabase = await createClient();

  const PET = "id, name, breed, species, weight_g, flags, photo_path, clients(id, full_name, phone)" as const;
  if (params.hidden === "1") return <HiddenPets orgId={org.id} />;
  const pets = () => supabase.from("pets").select(PET).eq("org_id", org.id).is("deleted_at", null).is("passed_away_on", null).order("name").limit(200);
  // % and _ are wildcards in a LIKE pattern; strip them so a search is always literal.
  const literal = q.replace(/[%_\\,()]/g, "");
  let data: QueryData<ReturnType<typeof pets>>;
  if (!literal) {
    const res = await pets();
    if (res.error) throw new Error("Could not load pets.");
    data = res.data;
  } else {
    // A pet's name, or its parent's name or phone number (typed any way: 98765 43210, +91...).
    const digits = q.replace(/\D/g, "");
    const parentFilter = [`full_name.ilike.%${literal}%`, ...(digits.length >= 4 ? [`phone.ilike.%${digits}%`, `alt_phone.ilike.%${digits}%`] : [])].join(",");
    const parents = await supabase.from("clients").select("id").eq("org_id", org.id).is("deleted_at", null).or(parentFilter).limit(200);
    if (parents.error) throw new Error("Could not load pets.");
    const [byName, byParent] = await Promise.all([
      pets().ilike("name", `%${literal}%`),
      parents.data.length > 0 ? pets().in("client_id", parents.data.map((c) => c.id)) : Promise.resolve({ data: [], error: null }),
    ]);
    if (byName.error || byParent.error) throw new Error("Could not load pets.");
    const seen = new Set<string>();
    data = [...byName.data, ...byParent.data].filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true))).sort((a, b) => a.name.localeCompare(b.name));
  }
  const photos = await signedUrls(supabase, data.map((p) => p.photo_path), { small: true });

  return (
    <>
      <PageTitle title={m.pets.title}>
        <Link href="/app/dogs/new" className={buttonStyles.primary}>
          {m.pets.add}
        </Link>
      </PageTitle>
      {params.done === "erased" ? <Notice tone="ok">{m.parent.privacy.erased}</Notice> : null}
      {params.done === "erased-files-left" ? <Notice tone="error">{m.parent.privacy.erasedFilesLeft}</Notice> : null}
      <form className="mb-4 flex gap-2" role="search">
        <label className="flex-1">
          <span className="sr-only">{m.pets.searchLabel}</span>
          <Input name="q" type="search" defaultValue={q} placeholder={m.pets.searchPlaceholder} />
        </label>
        <button type="submit" className={buttonStyles.secondary}>
          {m.pets.search}
        </button>
      </form>
      {data.length === 0 ? (
        <Empty>{q ? fill(m.pets.nothingFound, { q }) : m.pets.none}</Empty>
      ) : (
        <Ledger>
          {data.map((p) => (
            <LedgerRow key={p.id}>
              <PetAvatar name={p.name} url={p.photo_path ? photos.get(p.photo_path) : null} />
              <div className="min-w-0 flex-1 basis-48">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/app/dogs/${p.id}`} className="text-lg font-bold underline-offset-4 hover:underline">
                    {p.name}
                  </Link>
                  <span className="text-slate">{[p.breed, p.weight_g ? fill(m.pet.weight, { kg: formatKg(p.weight_g, locale) }) : null].filter(Boolean).join(", ")}</span>
                  {p.species !== "dog" ? <Badge>{(m.pet.speciesInLine as Record<string, string>)[p.species] ?? p.species}</Badge> : null}
                  {p.flags.map((f) => (
                    <Badge key={f} tone="alert">
                      {flagText(m, f)}
                    </Badge>
                  ))}
                </p>
                {p.clients ? (
                  <p className="mt-1 text-slate">
                    <Link href={`/app/clients/${p.clients.id}`} className="underline underline-offset-4">
                      {p.clients.full_name}
                    </Link>
                    ,{" "}
                    <a href={`tel:${p.clients.phone}`} className="underline underline-offset-4">
                      {formatPhone(p.clients.phone)}
                    </a>
                  </p>
                ) : null}
              </div>
              <Link href={`/app/bookings/new?pet=${p.id}`} className={buttonStyles.secondary}>
                {m.pets.bookStay}
              </Link>
            </LedgerRow>
          ))}
        </Ledger>
      )}
      <p className="mt-6">
        <Link href="/app/dogs?hidden=1" className={buttonStyles.quiet}>
          {m.pets.hiddenLink}
        </Link>
      </p>
    </>
  );
}

/** Pets hidden from lists (deleted_at), so that one can be found and shown again. Erased pets are not listed. */
async function HiddenPets({ orgId }: { orgId: string }) {
  const { m } = await getAppI18n();
  const supabase = await createClient();
  const res = await supabase
    .from("pets")
    .select("id, name, breed, clients(id, full_name, erased_at)")
    .eq("org_id", orgId)
    .not("deleted_at", "is", null)
    .order("name")
    .limit(500);
  if (res.error) throw new Error("Could not load pets.");
  const pets = res.data.filter((p) => !p.clients?.erased_at);

  return (
    <>
      <PageTitle title={m.pets.hiddenTitle}>
        <Link href="/app/dogs" className={buttonStyles.secondary}>
          {m.pets.backToPets}
        </Link>
      </PageTitle>
      <p className="mb-4 text-slate">{m.pets.hiddenAbout}</p>
      {pets.length === 0 ? (
        <Empty>{m.pets.hiddenNone}</Empty>
      ) : (
        <Ledger>
          {pets.map((p) => (
            <LedgerRow key={p.id}>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2">
                  <Link href={`/app/dogs/${p.id}`} className="text-lg font-bold underline underline-offset-4">
                    {p.name}
                  </Link>
                  {p.breed ? <span className="text-slate">{p.breed}</span> : null}
                </p>
                {p.clients ? <p className="mt-1 text-slate">{p.clients.full_name}</p> : null}
              </div>
            </LedgerRow>
          ))}
        </Ledger>
      )}
    </>
  );
}
