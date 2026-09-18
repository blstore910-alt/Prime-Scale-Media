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
