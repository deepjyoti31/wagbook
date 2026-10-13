import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { Badge, buttonStyles, Empty, Input, Ledger, LedgerRow, Loading, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatPhone } from "@/lib/core";
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

  let query = supabase
    .from("pets")
    .select("id, name, breed, species, weight_kg, flags, clients(full_name, phone)")
    .eq("org_id", org.id)
    .is("deleted_at", null)
    .order("name")
    .limit(200);
  // % and _ are wildcards in a LIKE pattern; strip them so a search is always literal.
  if (q) query = query.ilike("name", `%${q.replace(/[%_\\]/g, "")}%`);
  const { data, error } = await query;
  if (error) throw new Error("Could not load pets.");

  return (
    <>
      <form className="mb-4 flex gap-2" role="search">
        <label className="flex-1">
          <span className="sr-only">Search pets by name</span>
          <Input name="q" type="search" defaultValue={q} placeholder="Search by pet name" />
        </label>
        <button type="submit" className={buttonStyles.secondary}>
          Search
        </button>
      </form>
      {data.length === 0 ? (
        <Empty>{q ? `No pet called "${q}".` : "No pets yet. Add one, or send parents your intake form from More."}</Empty>
      ) : (
        <Ledger>
          {data.map((p) => (
            <LedgerRow key={p.id}>
              <div className="min-w-0 flex-1 basis-64">
                <p className="flex flex-wrap items-center gap-2">
                  <span className="text-lg font-bold">{p.name}</span>
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
                    {p.clients.full_name},{" "}
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
