/**
 * THE NUMBER AN AFFILIATE IS ALLOWED TO SEE ON HIS OWN PAYOUT.
 *
 * `affiliate_payouts.payout_no` is `max(payout_no) + 1` per TENANT --
 * one house-wide series. It has to be: the payout page doubles as a
 * self-billed invoice we raise, so its number must be unique and
 * sequential per issuer. Restarting it per affiliate would hand two
 * different partners an invoice #1.
 *
 * But it was printed, bare, on the affiliate's own screen. The owner
 * read it wrong at first sight -- "waarom staat hier payout 4? is dit
 * de 4de payout van deze affiliate?" (it was their second) -- and then
 * named the real problem: "hun mogen niet zien tenant payouts alleen
 * per affiliate". A partner counting from #2 to #7 between two of their
 * own requests learns how many payouts the whole company made in
 * between. That is our number, not theirs.
 *
 * So the reference becomes a sub-series per partner:
 *
 *     PSM0008-02
 *
 * Still unique across the house (the client code is unique), still
 * sequential within one supplier, and it says nothing about anyone
 * else. `payout_no` stays exactly as it is in the database and stays
 * visible to the owner, who may see it.
 *
 * Counted over GROUPS, not rows: one request may carry a EUR row and a
 * USD row under one `group_id`, and that is one transfer with one
 * document.
 */

export type PayoutRefRow = {
  id: string;
  group_id?: string | null;
  /** ISO timestamp. Ordering is by when it was asked for. */
  requested_at?: string | null;
  created_at?: string | null;
};

/** One key per transfer: the group if there is one, else the row. */
export function payoutGroupKey(row: PayoutRefRow): string {
  return String(row.group_id ?? row.id);
}

function whenOf(row: PayoutRefRow): number {
  const t = Date.parse(String(row.requested_at ?? row.created_at ?? ""));
  return Number.isFinite(t) ? t : 0;
}

/**
 * Each transfer's position in this affiliate's own history, oldest
 * first, starting at 1.
 *
 * Every payout the affiliate ever made counts, including the ones that
 * were sent back or withdrawn -- a document series does not renumber
 * itself when one is cancelled, and a partner who kept the refused one
 * would otherwise see the same reference twice.
 *
 * Ties (same timestamp to the millisecond) fall back to the key, so the
 * answer is stable across renders rather than depending on the order
 * the rows arrived in.
 */
export function payoutSequence(
  rows: readonly PayoutRefRow[],
): Map<string, number> {
  const firstSeen = new Map<string, { when: number; key: string }>();
  for (const r of rows) {
    const key = payoutGroupKey(r);
    const when = whenOf(r);
    const have = firstSeen.get(key);
    if (!have || when < have.when) firstSeen.set(key, { when, key });
  }
  const ordered = [...firstSeen.values()].sort(
    (a, b) => a.when - b.when || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
  );
  const out = new Map<string, number>();
  ordered.forEach((g, i) => out.set(g.key, i + 1));
  return out;
}

/**
 * The reference as it is shown and printed: `PSM0008-02`.
 *
 * Without a client code there is nothing to make a per-partner series
 * out of, so it returns null and the caller falls back to its own
 * wording ("Your payout request") rather than printing a bare house
 * number.
 */
export function payoutRef(
  clientCode: string | null | undefined,
  seq: number | null | undefined,
): string | null {
  const code = String(clientCode ?? "").trim().toUpperCase();
  if (!code) return null;
  if (typeof seq !== "number" || !Number.isFinite(seq) || seq < 1) return null;
  return `${code}-${String(Math.floor(seq)).padStart(2, "0")}`;
}
