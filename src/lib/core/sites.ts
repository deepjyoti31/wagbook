/**
 * All sites (M65, D55): an owner of several kennels sees each one's month and
 * the sites added up. Each site is a kennel of its own (D49), so its figures
 * come from its own reports; this only adds them, and only in one currency.
 */

/** One site's figures for a period, as `report_sites()` gives them. */
export interface SiteFigures {
  orgId: string;
  name: string;
  currency: string;
  /** Boarding nights sold. */
  nights: number;
  /** Day boarding days sold. */
  days: number;
  /** Kennels in service, added over the days of the period. */
  kennelDays: number;
  /** Kennels in use, added over the days of the period. */
  kennelsUsed: number;
  billedMinor: number;
  creditedMinor: number;
  receivedMinor: number;
  refundedMinor: number;
  spentMinor: number;
  /** Owed on issued bills today. */
  owedMinor: number;
  billsOwed: number;
}

/** What a site, or sites in one currency together, come to. */
export interface SiteSummary {
  currency: string;
  /** How many sites are in it. */
  sites: number;
  nights: number;
  days: number;
  /** Kennels used as a share of kennels available, in whole percent. Null with no kennels. */
  percentFull: number | null;
  /** Billed less credit notes, as on a site's own report. */
  billedMinor: number;
  receivedMinor: number;
  refundedMinor: number;
  spentMinor: number;
  /** Received less refunded less spent. */
  netMinor: number;
  owedMinor: number;
  billsOwed: number;
}

/** One site's figures as the report shows them. */
export function summariseSite(site: SiteFigures): SiteSummary {
  return addUp(site.currency, [site]);
}

/**
 * The sites added up, one total for each currency, in the order the currencies
 * first appear. Sites in different currencies are never added together.
 */
export function combineSites(sites: readonly SiteFigures[]): SiteSummary[] {
  const byCurrency = new Map<string, SiteFigures[]>();
  for (const site of sites) {
    const list = byCurrency.get(site.currency);
    if (list) list.push(site);
    else byCurrency.set(site.currency, [site]);
  }
  return [...byCurrency].map(([currency, list]) => addUp(currency, list));
}

function addUp(currency: string, sites: readonly SiteFigures[]): SiteSummary {
  const sum = (pick: (s: SiteFigures) => number) => sites.reduce((n, s) => n + pick(s), 0);
  const available = sum((s) => s.kennelDays);
  const received = sum((s) => s.receivedMinor);
  const refunded = sum((s) => s.refundedMinor);
  const spent = sum((s) => s.spentMinor);
  return {
    currency,
    sites: sites.length,
    nights: sum((s) => s.nights),
    days: sum((s) => s.days),
    percentFull: available > 0 ? Math.round((sum((s) => s.kennelsUsed) / available) * 100) : null,
    billedMinor: sum((s) => s.billedMinor) - sum((s) => s.creditedMinor),
    receivedMinor: received,
    refundedMinor: refunded,
    spentMinor: spent,
    netMinor: received - refunded - spent,
    owedMinor: sum((s) => s.owedMinor),
    billsOwed: sum((s) => s.billsOwed),
  };
}
