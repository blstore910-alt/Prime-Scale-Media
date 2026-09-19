/**
 * Every row, not the first thousand.
 *
 * PostgREST caps a response at 1,000 rows. A total built from an
 * unbounded select is therefore right until the thousand-and-first row
 * exists and silently wrong for ever after — no error, no warning, just a
 * smaller number. This project has been bitten by it twice already
 * (hooks/use-account-spend.ts, actions/bank-ledger-actions.ts), which is
 * why the pattern now lives in one place.
 *
 * Ordered oldest-first by the caller so the pages are stable while we walk
 * them, and capped, with the cap REPORTED rather than swallowed: a silent
 * truncation reads exactly like a complete answer, which is the whole
 * fault being fixed.
 */

export const PAGE_SIZE = 1000;
export const MAX_PAGES = 50;

export type PagedResult<T> = {
  rows: T[];
  /** True when the cap was hit, so the total is a floor rather than a sum. */
  truncated: boolean;
  error: string | null;
};

export async function pageAllRows<T>(
  fetchPage: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  { pageSize = PAGE_SIZE, maxPages = MAX_PAGES } = {},
): Promise<PagedResult<T>> {
  const rows: T[] = [];
  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const { data, error } = await fetchPage(from, from + pageSize - 1);
    if (error) return { rows, truncated: false, error: error.message };
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < pageSize) {
      return { rows, truncated: false, error: null };
    }
  }
  return { rows, truncated: true, error: null };
}

/**
 * Does this error mean "that column is not there"?
 *
 * The live database is hand-authored and diverges from both the repo
 * migrations and the generated types, so naming a column that has not
 * been added yet does not degrade — PostgREST throws 42703 and the
 * message lands on whatever screen asked. CLAUDE.md's rule is to ask for
 * it and, on that error, ask again without it.
 */
export function isMissingColumn(message: string | null | undefined): boolean {
  if (!message) return false;
  return /42703|does not exist|schema cache|PGRST20\d/i.test(message);
}

/**
 * Page a query, and if it fails ONLY because a column is missing, page a
 * narrower one instead.
 *
 * WHY IT EXISTS. Eight money readers were given a `.not("is_deleted",
 * "is", true)` filter so a struck-out top-up stops counting as revenue.
 * That is right — and `top_ups` is hand-authored on live, so if the
 * column is not there every one of those readers throws and the owner's
 * whole dashboard, the fee and profit series and the CUSTOMER'S OWN
 * financial report all go dark at once. A filter that makes a number
 * more correct must never be able to take the number away.
 *
 * So: the strict read first, and the old behaviour as the fallback. The
 * feature stays dark until the column exists, which is the same bargain
 * every other pending-migration read in this app makes.
 */
export async function pageAllRowsTolerant<T>(
  strict: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  fallback: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  opts?: { pageSize?: number; maxPages?: number },
): Promise<PagedResult<T>> {
  const first = await pageAllRows<T>(strict, opts);
  if (!first.error || !isMissingColumn(first.error)) return first;
  return pageAllRows<T>(fallback, opts);
}
