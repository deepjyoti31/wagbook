import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Ledger, Loading, Notice, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.problems.title);

/**
 * Problems and overnight jobs (M46, M48). Owners and managers see whether the
 * nightly jobs worked; owners also see errors on the server, grouped by what
 * failed, for the last 90 days.
 */
export default function ProblemsPage() {
  return (
    <Suspense fallback={<Loading />}>
      <Problems />
    </Suspense>
  );
}

const JOBS = ["plan_deliveries", "forget_old_rows"] as const;

async function Problems() {
  const { org, canManage, canDelete } = await requireOrg();
  if (!canManage) redirect("/app/more");
  const { m, language, locale } = await getAppI18n();
  const w = m.problems;
  const supabase = await createClient();
  const [runs, errors] = await Promise.all([
    supabase.from("job_runs").select("job, ran_at, ok, made, problem").eq("org_id", org.id).order("ran_at", { ascending: false }).limit(50),
    canDelete
      ? supabase.from("app_errors").select("happened_at, path, kind, message, digest").eq("org_id", org.id).order("happened_at", { ascending: false }).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (runs.error || errors.error) throw new Error("Could not load the problems.");
  const when = new Intl.DateTimeFormat(locale, { timeZone: org.time_zone, day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

  // The latest run of each job.
  const latest = JOBS.map((job) => runs.data.find((r) => r.job === job)).filter((r): r is NonNullable<typeof r> => Boolean(r));

  // The same failure many times is one line, with how often and when last.
  const groups = new Map<string, { path: string; kind: string; message: string; digest: string | null; count: number; last: string }>();
  for (const e of errors.data) {
    const key = `${e.kind}|${e.path}|${e.message}`;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { path: e.path, kind: e.kind, message: e.message, digest: e.digest, count: 1, last: e.happened_at });
  }

  return (
    <>
      <PageTitle title={w.title} />
      <p className="mb-6 text-lg">{w.intro}</p>

      <h2 className="mb-2 text-xl font-bold">{w.jobsTitle}</h2>
      {latest.length === 0 ? (
        <Notice tone="info">{w.noJobs}</Notice>
      ) : (
        <Ledger>
          {latest.map((r) => (
            <li key={r.job} className="px-4 py-3">
              <span className="block font-bold">{w.jobNames[r.job as (typeof JOBS)[number]] ?? r.job}</span>
              {r.ok ? (
                <span className="block text-slate">
                  {fill(w.jobOk, { when: when.format(new Date(r.ran_at)) })}, {plural(language, r.made, w.jobMade)}
                </span>
              ) : (
                <span className="block font-semibold text-alert">{fill(w.jobFailed, { when: when.format(new Date(r.ran_at)), problem: r.problem ?? "" })}</span>
              )}
            </li>
          ))}
        </Ledger>
      )}

      <h2 className="mt-8 mb-2 text-xl font-bold">{w.errorsTitle}</h2>
      {!canDelete ? (
        <p className="text-slate">{w.errorsOwners}</p>
      ) : groups.size === 0 ? (
        <Notice tone="ok">{w.noErrors}</Notice>
      ) : (
        <Ledger>
          {[...groups.values()].map((g) => (
            <li key={`${g.kind}|${g.path}|${g.message}`} className="px-4 py-3">
              <span className="block font-bold break-words">{g.message}</span>
              <span className="block text-slate break-words">
                {w.kinds[g.kind as keyof typeof w.kinds] ?? g.kind}: {g.path}
              </span>
              <span className="block text-sm text-slate">
                {plural(language, g.count, w.times)}, {fill(w.lastAt, { when: when.format(new Date(g.last)) })}
                {g.digest ? `. ${fill(w.code, { digest: g.digest })}` : ""}
              </span>
            </li>
          ))}
        </Ledger>
      )}
    </>
  );
}
