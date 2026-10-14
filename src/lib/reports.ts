import "server-only";

/**
 * Reports, expenses and downloads, as screens need them. Kept out of the
 * "use server" files, which may export only async functions.
 */

/** Offered when adding an expense. Any other word is fine too. */
export const EXPENSE_CATEGORIES = ["Food", "Staff wages", "Rent", "Electricity and water", "Vet and medicines", "Cleaning", "Repairs", "Other"] as const;

export const DOWNLOADS = {
  bookings: "Bookings (by first day)",
  bills: "Bills (by bill date)",
  payments: "Payments (by date paid)",
  expenses: "Expenses (by date spent)",
} as const;
export type Download = keyof typeof DOWNLOADS;

/** The most rows one download holds. Ten years of a busy kennel is well under this. */
export const DOWNLOAD_MAX_ROWS = 20_000;
const PAGE = 1000;

/**
 * Every row a query returns, a page at a time: the API sends at most 1,000
 * rows per request (supabase/config.toml, max_rows). `page(from, to)` builds
 * the query for one page with `.range(from, to)`.
 */
export async function fetchAll<T>(page: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: unknown }>): Promise<T[] | null> {
  const out: T[] = [];
  for (let from = 0; from < DOWNLOAD_MAX_ROWS; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error || !data) return null;
    out.push(...data);
    if (data.length < PAGE) break;
  }
  return out;
}
