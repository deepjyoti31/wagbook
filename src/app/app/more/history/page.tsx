import Link from "next/link";
import { Suspense } from "react";
import { Rich } from "@/components/rich";
import { buttonStyles, Empty, Field, Loading, PageTitle, Select } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatMoney } from "@/lib/core";
import { describeEntry, historyLink, HISTORY_TABLES, idsIn, isHistoryTable, type HistoryFormat } from "@/lib/history";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.history.title);

const PAGE = 50;

export default function HistoryPage({ searchParams }: PageProps<"/app/more/history">) {
  return (
    <Suspense fallback={<Loading />}>
      <History searchParams={searchParams} />
    </Suspense>
  );
}

async function History({ searchParams }: Pick<PageProps<"/app/more/history">, "searchParams">) {
  const query = await searchParams;
  const { org, canManage } = await requireOrg();
  const { m, language, locale } = await getAppI18n();
  const h = m.history;
  const title = <PageTitle title={h.title} />;
  if (!canManage)
    return (
      <>
        {title}
        <Empty>{h.managersOnly}</Empty>
      </>
    );

  const table = isHistoryTable(query.table) ? query.table : "";
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
  const [pets, clients, kennels, services, places, appointmentServices] = ids.length
    ? await Promise.all([
        supabase.from("pets").select("id, name").eq("org_id", org.id).in("id", ids),
        supabase.from("clients").select("id, full_name").eq("org_id", org.id).in("id", ids),
        supabase.from("kennels").select("id, name").eq("org_id", org.id).in("id", ids),
        supabase.from("services").select("id, name").eq("org_id", org.id).in("id", ids),
        supabase.from("appointment_places").select("id, name").eq("org_id", org.id).in("id", ids),
        supabase.from("appointment_services").select("id, name").eq("org_id", org.id).in("id", ids),
      ])
    : [];
  const names = new Map<string, string>([
    ...members.data.map((x) => [x.user_id, x.display_name] as const),
    ...(pets?.data ?? []).map((p) => [p.id, p.name] as const),
    ...(clients?.data ?? []).map((c) => [c.id, c.full_name] as const),
    ...(kennels?.data ?? []).map((k) => [k.id, fill(h.kennel, { name: k.name })] as const),
    ...(services?.data ?? []).map((x) => [x.id, x.name] as const),
    ...(places?.data ?? []).map((x) => [x.id, x.name] as const),
    ...(appointmentServices?.data ?? []).map((x) => [x.id, x.name] as const),
  ]);
  const when = new Intl.DateTimeFormat(locale, { timeZone: org.time_zone, day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
  const fmt: HistoryFormat = {
    words: h.log,
    money: (minor) => formatMoney(minor, { currency: org.currency, locale, trimZeros: true }),
    time: (iso) => when.format(new Date(iso)),
    name: (id) => names.get(id),
  };
  const filters = new URLSearchParams({ ...(table ? { table } : {}), ...(person ? { person } : {}) });

  return (
    <>
      {title}
      <p className="mb-4 text-slate">{h.intro}</p>
      <form method="get" className="mb-5 grid gap-3 rounded-xl border border-rule bg-paper p-4 sm:grid-cols-3">
        <Field label={h.what}>
          <Select name="table" defaultValue={table}>
            <option value="">{h.everything}</option>
            {HISTORY_TABLES.map((key) => (
              <option key={key} value={key}>
                {h.log.tables[key]}
              </option>
            ))}
          </Select>
        </Field>
        <Field label={h.who}>
          <Select name="person" defaultValue={person}>
            <option value="">{h.everyone}</option>
            {members.data.map((x) => (
              <option key={x.user_id} value={x.user_id}>
                {x.display_name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex items-end">
          <button type="submit" className={buttonStyles.secondary}>
            {m.common.show}
          </button>
        </div>
      </form>

      {shown.length === 0 ? (
        <Empty>{table || person ? h.noneMatch : h.noneYet}</Empty>
      ) : (
        <ul className="space-y-3">
          {shown.map((e) => {
            const d = describeEntry(e, fmt);
            const link = historyLink(e);
            const who = e.actor ? (names.get(e.actor) ?? h.someoneGone) : m.common.appName;
            return (
              <li key={e.id} className="rounded-xl border border-rule bg-paper p-4">
                <p className="font-bold">
                  {d.title}
                  {link ? (
                    <>
                      {" "}
                      <Link href={link} className="font-semibold underline underline-offset-4">
                        {m.common.open}
                      </Link>
                    </>
                  ) : null}
                </p>
                <p className="text-sm text-slate">{fill(h.whoWhen, { who, when: when.format(new Date(e.at)) })}</p>
                {d.fields.length > 0 ? (
                  <details className="mt-1" open={e.action === "update"}>
                    <summary className="inline-flex min-h-12 cursor-pointer items-center font-semibold underline underline-offset-4">
                      {plural(language, d.fields.length, h.details)}
                    </summary>
                    <dl className="space-y-1 text-sm">
                      {d.fields.map((f) => (
                        <div key={f.label} className="break-words">
                          <dt className="inline font-semibold">{fill(h.field, { label: f.label })}</dt>
                          <dd className="inline">
                            {f.was !== null && f.now !== null ? <Rich text={h.wasNow} parts={{ was: f.was, now: <strong>{f.now}</strong> }} /> : (f.now ?? f.was)}
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
            {h.older}
          </Link>
        </p>
      ) : null}
    </>
  );
}
