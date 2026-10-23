import { redirect } from "next/navigation";
import { Suspense } from "react";
import { ActionForm } from "@/components/action-form";
import { ConfirmStep } from "@/components/confirm-step";
import { buttonStyles, Ledger, Loading, Notice, PageTitle } from "@/components/ui";
import { requireOrg } from "@/lib/auth";
import { formatBytes, todayIn } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";
import { removePhotoMonth } from "./actions";

export const generateMetadata = () => appTitle((m) => m.photoArchive.title);

/**
 * Photos and space (M49, D49): what the kennel's files take, month by month,
 * and a month's photos downloaded and then removed from Wagbook by an owner.
 * Owners and managers.
 */
export default function PhotosPage({ searchParams }: PageProps<"/app/more/photos">) {
  return (
    <Suspense fallback={<Loading />}>
      <Photos searchParams={searchParams} />
    </Suspense>
  );
}

async function Photos({ searchParams }: Pick<PageProps<"/app/more/photos">, "searchParams">) {
  const done = (await searchParams).done;
  const { org, canManage, canDelete } = await requireOrg();
  if (!canManage) redirect("/app/more");
  const { m, language, locale } = await getAppI18n();
  const w = m.photoArchive;
  const supabase = await createClient();
  const [space, archives] = await Promise.all([
    supabase.rpc("photo_space", { p_org: org.id }),
    supabase.from("photo_archives").select("month, downloaded_at, removed_at, files, bytes").eq("org_id", org.id),
  ]);
  if (space.error || archives.error) throw new Error("Could not load the photos.");
  const byMonth = new Map(archives.data.map((a) => [a.month, a]));
  const thisMonth = `${todayIn(org.time_zone).slice(0, 7)}-01`;
  const monthName = new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" });
  const when = new Intl.DateTimeFormat(locale, { timeZone: org.time_zone, day: "numeric", month: "short", year: "numeric" });
  const size = (bytes: number) => formatBytes(bytes, locale);
  const total = space.data.reduce((sum, r) => sum + Number(r.bytes), 0);

  // Months with files, and months archived whose files are all gone but the small copies.
  const months = [...new Set([...space.data.map((r) => r.month), ...archives.data.map((a) => a.month)])].sort().reverse();

  return (
    <>
      <PageTitle title={w.title} />
      {done === "removed" ? <Notice tone="ok">{w.removedOk}</Notice> : null}
      <p className="mb-2 text-lg">{w.intro}</p>
      <p className="mb-4 text-slate">{w.notArchived}</p>
      {months.length === 0 ? (
        <Notice tone="info">{w.noFiles}</Notice>
      ) : (
        <>
          <p className="mb-2 font-semibold">{fill(w.total, { size: size(total) })}</p>
          <Ledger>
            {months.map((month) => {
              const row = space.data.find((r) => r.month === month);
              const archive = byMonth.get(month);
              const photos = Number(row?.photos ?? 0);
              const label = monthName.format(new Date(`${month}T00:00:00Z`));
              return (
                <li key={month} className="space-y-2 px-4 py-3">
                  <span className="block text-lg font-bold">{label}</span>
                  {row ? <span className="block text-slate">{plural(language, Number(row.files), w.files, { size: size(Number(row.bytes)) })}</span> : null}
                  {month >= thisMonth ? (
                    <span className="block text-slate">{w.thisMonth}</span>
                  ) : photos === 0 ? (
                    archive?.removed_at ? (
                      <span className="block text-slate">
                        {fill(w.removed, { when: when.format(new Date(archive.removed_at)), n: archive.files, size: size(Number(archive.bytes)) })}
                      </span>
                    ) : (
                      <span className="block text-slate">{w.none}</span>
                    )
                  ) : (
                    <>
                      <span className="block">{plural(language, photos, w.photos, { size: size(Number(row?.photo_bytes ?? 0)) })}</span>
                      <a href={`/app/more/photos/download?month=${month}`} download className={buttonStyles.secondary}>
                        {w.download}
                      </a>
                      {archive?.downloaded_at ? (
                        <span className="block text-sm text-slate">{fill(w.downloaded, { when: when.format(new Date(archive.downloaded_at)) })}</span>
                      ) : null}
                      {archive?.downloaded_at && canDelete ? (
                        <ActionForm action={removePhotoMonth}>
                          <input type="hidden" name="month" value={month} />
                          <ConfirmStep
                            label={w.remove}
                            warning={fill(w.removeConfirm, { n: photos, month: label })}
                            confirm={w.removeYes}
                            pending={w.removing}
                          />
                        </ActionForm>
                      ) : null}
                      {archive?.downloaded_at && !canDelete ? <span className="block text-sm text-slate">{w.ownersRemove}</span> : null}
                    </>
                  )}
                </li>
              );
            })}
          </Ledger>
        </>
      )}
    </>
  );
}
