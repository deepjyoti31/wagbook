import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonStyles, Empty, Input, Ledger, LedgerRow, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatPhone } from "@/lib/core";
import type { QueryData } from "@supabase/supabase-js";
import { PetAvatar } from "@/components/pet-avatar";
import { signedUrls } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Pets" };

export default function PetsPage({ searchParams }: PageProps<"/app/dogs">) {
  return (
    <>
      <PageTitle title="Pets">
        <Link href="/app/dogs/new" className={buttonStyles.primary}>
          Add a pet
        </Link>
      </PageTitle>
      <Suspense fallback={<Loading label="Loading pets" />}>
        <Pets searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function Pets({ searchParams }: Pick<PageProps<"/app/dogs">, "searchParams">) {
  const params = await searchParams;
  const q = typeof params.q === "string" ? params.q.trim().slice(0, 60) : "";
  const { org } = await requireOrg();
  const supabase = await createClient();

  const PET = "id, name, breed, species, weight_kg, flags, photo_path, clients(id, full_name, phone)" as const;
  const pets = () => supabase.from("pets").select(PET).eq("org_id", org.id).is("deleted_at", null).order("name").limit(200);
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
      <form className="mb-4 flex gap-2" role="search">
        <label className="flex-1">
          <span className="sr-only">Search by pet name, parent name or phone number</span>
          <Input name="q" type="search" defaultValue={q} placeholder="Pet, parent or phone" />
        </label>
        <button type="submit" className={buttonStyles.secondary}>
          Search
        </button>
      </form>
      {data.length === 0 ? (
        <Empty>{q ? `Nothing found for "${q}".` : "No pets yet. Add one, or send parents your intake form from More."}</Empty>
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
                  <span className="text-slate">{[p.breed, p.weight_kg ? `${p.weight_kg} kg` : null].filter(Boolean).join(", ")}</span>
                  {p.species !== "dog" ? <Badge>{p.species}</Badge> : null}
                  {p.flags.map((f) => (
                    <Badge key={f} tone="alert">
                      {f.replaceAll("_", " ")}
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
                Book a stay
              </Link>
            </LedgerRow>
          ))}
        </Ledger>
      )}
    </>
  );
}
