import Link from "next/link";
import { Suspense } from "react";
import { switchOrganisation } from "@/app/app/actions";
import { MonthPicker } from "@/components/month-picker";
import { buttonStyles, Empty, Figure, Loading, PageTitle, Section } from "@/components/ui";
import { getMemberships, requireOrg } from "@/lib/auth";
import { combineSites, formatMoney, isYearMonth, monthBounds, summariseSite, todayIn, type SiteFigures, type SiteSummary } from "@/lib/core";
import { fill, plural } from "@/lib/i18n";
import { appTitle, getAppI18n, type I18n } from "@/lib/i18n-server";
import { createClient } from "@/lib/supabase/server";

export const generateMetadata = () => appTitle((m) => m.reports.sites.title);

/**
 * All sites (M65, D55): each kennel the reader owns, from its own reports, and
 * the kennels added up. Only for an owner of two or more; the database refuses
 * anyone who owns none (WB062) and leaves out kennels the reader only manages.
 */
export default function AllSitesPage({ searchParams }: PageProps<"/app/more/reports/sites">) {
  return (
    <Suspense fallback={<Loading />}>
      <AllSites searchParams={searchParams} />
    </Suspense>
  );
}

async function AllSites({ searchParams }: Pick<PageProps<"/app/more/reports/sites">, "searchParams">) {
  const query = await searchParams;
  const { org } = await requireOrg();
  const t = await getAppI18n();
  const { m, language } = t;
  const s = m.reports.sites;
  const title = <PageTitle title={s.title} />;
  const owned = (await getMemberships()).filter((x) => x.role === "owner");
  if (owned.length < 2)
    return (
      <>
        {title}
        <Empty>{s.ownersOnly}</Empty>
      </>
    );

  const today = todayIn(org.time_zone);
  const month = isYearMonth(query.month) ? query.month : today.slice(0, 7);
  const { first, last } = monthBounds(month);
  const { data, error } = await (await createClient()).rpc("report_sites", { p_from: first, p_to: last });
  if (error) throw new Error("Could not add up the sites.");
  const sites: SiteFigures[] = data.map((r) => ({
    orgId: r.org_id,
    name: r.name,
    currency: r.currency,
    nights: r.nights,
    days: r.day_boarding_days,
    kennelDays: r.kennel_days,
    kennelsUsed: r.kennels_used,
    billedMinor: r.billed_minor,
    creditedMinor: r.credited_minor,
    receivedMinor: r.received_minor,
    refundedMinor: r.refunded_minor,
    spentMinor: r.spent_minor,
    owedMinor: r.owed_minor,
    billsOwed: r.bills_owed,
  }));
  const totals = combineSites(sites);

  return (
    <>
      {title}
      <p className="mb-4 text-slate">{s.intro}</p>
      <MonthPicker month={month} href={(x) => `/app/more/reports/sites?month=${x}`} locale={t.locale} words={m.common} />

      {totals.map((x) => (
        <Section key={x.currency} title={totals.length > 1 ? fill(s.togetherIn, { currency: x.currency }) : s.together}>
          <p className="mb-2 text-slate">{plural(language, x.sites, s.sites)}</p>
          <Figures x={x} t={t} />
        </Section>
      ))}

      {sites.map((site) => (
        <Section key={site.orgId} title={site.name}>
          <Figures x={summariseSite(site)} t={t} />
          {site.orgId === org.id ? (
            <p className="mt-2 text-slate">{s.here}</p>
          ) : (
            <form action={switchOrganisation} className="mt-2">
              <input type="hidden" name="orgId" value={site.orgId} />
              <button type="submit" className={buttonStyles.secondary}>
                {fill(m.more.switchTo, { kennel: site.name })}
              </button>
            </form>
          )}
        </Section>
      ))}

      <p className="mb-4 text-sm text-slate">{s.note}</p>
      <p>
        <Link href={`/app/more/reports?month=${month}`} className="inline-flex min-h-12 items-center font-semibold underline underline-offset-4">
          {m.reports.title}
        </Link>
      </p>
    </>
  );
}

/** A site's month, or sites added up, as figures: how full, then money. */
function Figures({ x, t }: { x: SiteSummary; t: I18n }) {
  const { m, language, locale } = t;
  const r = m.reports;
  const fmt = (minor: number) => formatMoney(minor, { currency: x.currency, locale, trimZeros: true });
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      <Figure label={r.nightsSold}>{x.nights}</Figure>
      <Figure label={r.dayBoardingDays}>{x.days}</Figure>
      <Figure label={r.kennelsUsed}>{x.percentFull === null ? r.noKennels : fill(r.percent, { n: x.percentFull })}</Figure>
      <Figure label={r.billed}>{fmt(x.billedMinor)}</Figure>
      <Figure label={r.received}>{fmt(x.receivedMinor)}</Figure>
      {x.refundedMinor > 0 ? <Figure label={r.refunded}>{fmt(x.refundedMinor)}</Figure> : null}
      <Figure label={r.spent}>{fmt(x.spentMinor)}</Figure>
      <Figure label={r.net}>{fmt(x.netMinor)}</Figure>
      <Figure label={r.sites.owed} hint={x.billsOwed > 0 ? plural(language, x.billsOwed, r.sites.onBills) : undefined}>
        {fmt(x.owedMinor)}
      </Figure>
    </div>
  );
}
