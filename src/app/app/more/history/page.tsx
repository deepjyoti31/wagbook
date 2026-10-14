import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { buttonStyles, Empty, Field, Loading, PageTitle, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatMoney } from "@/lib/core";
import { describeEntry, historyLink, HISTORY_TABLES, idsIn, type HistoryFormat } from "@/lib/history";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "History of changes" };

const PAGE = 50;

export default function HistoryPage({ searchParams }: PageProps<"/app/more/history">) {
  return (
    <>
      <PageTitle title="History of changes" />
      <Suspense fallback={<Loading label="Loading the history" />}>
        <History searchParams={searchParams} />
      </Suspense>
    </>
  );
}

async function History({ searchParams }: Pick<PageProps<"/app/more/history">, "searchParams">) {
  const query = await searchParams;
  const { org, canManage } = await requireOrg();
  if (!canManage) return <Empty>The history of changes is for owners and managers.</Empty>;

  const table = typeof query.table === "string" && query.table in HISTORY_TABLES ? query.table : "";
  const person = typeof query.person === "string" && /^[0-9a-f-]{36}$/.test(query.person) ? query.person : "";
  const before = typeof query.before === "string" && /^\d{1,18}$/.test(query.before) ? Number(query.before) : null;

  const supabase = await createClient();
  let log = supabase.from("audit_log").select("id, at, actor, action, table_name, row_id, old_data, new_data").eq("org_id", org.id);
  if (table) log = log.eq("table_name", table);
  if (person) log = log.eq("actor", person);
  if (before) log = log.lt("id", before);
  const [entries, members] = await Promise.all([
    log.order("id", { ascending: false }).limit(PAGE + 1),
    supabase.from("memberships").select("user_id, display_name").eq("org_id", org.id).order("display_name"),
  ]);
  if (entries.error || members.error) throw new Error("Could not load the history.");

  const shown = entries.data.slice(0, PAGE);
  const more = entries.data.length > PAGE ? shown[shown.length - 1].id : null;

  // Ids in the log become names: people, pets, parents, kennels and price list rows.
  const ids = [...new Set(shown.flatMap(idsIn))].slice(0, 300);
  const [pets, clients, kennels, services] = ids.length
    ? await Promise.all([
        supabase.from("pets").select("id, name").eq("org_id", org.id).in("id", ids),
        supabase.from("clients").select("id, full_name").eq("org_id", org.id).in("id", ids),
        supabase.from("kennels").select("id, name").eq("org_id", org.id).in("id", ids),
        supabase.from("services").select("id, name").eq("org_id", org.id).in("id", ids),
      ])
    : [];
  const names = new Map<string, string>([
    ...members.data.map((m) => [m.user_id, m.display_name] as const),
    ...(pets?.data ?? []).map((p) => [p.id, p.name] as const),
    ...(clients?.data ?? []).map((c) => [c.id, c.full_name] as const),
    ...(kennels?.data ?? []).map((k) => [k.id, `kennel ${k.name}`] as const),
    ...(services?.data ?? []).map((x) => [x.id, x.name] as const),
  ]);
  const when = new Intl.DateTimeFormat(org.locale, { timeZone: org.time_zone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const fmt: HistoryFormat = {
    money: (minor) => formatMoney(minor, { currency: org.currency, locale: org.locale, trimZeros: true }),
    time: (iso) => when.format(new Date(iso)),
    name: (id) => names.get(id),
  };
  const filters = new URLSearchParams({ ...(table ? { table } : {}), ...(person ? { person } : {}) });

  return (
    <>
      <p className="mb-4 text-slate">Every change to bookings, money, the price list, incidents, settings and people, newest first. Nobody can edit or remove it.</p>
      <form method="get" className="mb-5 grid gap-3 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
        <Field label="What">
          <Select name="table" defaultValue={table}>
            <option value="">Everything</option>
            {Object.entries(HISTORY_TABLES).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Who">
          <Select name="person" defaultValue={person}>
            <option value="">Everyone</option>
            {members.data.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.display_name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <button type="submit" className={buttonStyles.secondary}>
            Show
          </button>
        </div>
      </form>

      {shown.length === 0 ? (
        <Empty>No changes {table || person ? "match" : "yet"}.</Empty>
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => {
            const d = describeEntry(e, fmt);
            const link = historyLink(e);
            const who = e.actor ? (names.get(e.actor) ?? "Someone who no longer works here") : "Wagbook";
            return (
              <li key={e.id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="font-bold">
                  {d.title}
                  {link ? (
                    <>
                      {" "}
                      <Link href={link} className="font-semibold underline underline-offset-4">
                        Open
                      </Link>
                    </>
                  ) : null}
                </p>
                <p className="text-sm text-slate">
                  {who}, {when.format(new Date(e.at))}
                </p>
                {d.fields.length > 0 ? (
                  <details className="mt-1" open={e.action === "update"}>
                    <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">
                      {d.fields.length === 1 ? "1 detail" : `${d.fields.length} details`}
                    </summary>
                    <dl className="space-y-1 text-sm">
                      {d.fields.map((f) => (
                        <div key={f.label} className="break-words">
                          <dt className="inline font-semibold">{f.label}: </dt>
                          <dd className="inline">
                            {f.was !== null && f.now !== null ? (
                              <>
                                was {f.was}, now <strong>{f.now}</strong>
                              </>
                            ) : (
                              (f.now ?? f.was)
                            )}
                          </dd>
                        </div>
                      ))}
                    </dl>
                  </details>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {more ? (
        <p className="mt-4">
          <Link href={`/app/more/history?${new URLSearchParams({ ...Object.fromEntries(filters), before: String(more) })}`} className={buttonStyles.secondary}>
            Older changes
          </Link>
        </p>
      ) : null}
    </>
  );
}
