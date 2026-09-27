/**
 * What an affiliate has actually been PAID, in a period.
 *
 * The tile used to derive it:
 *
 *   paid = max(0, earnings - unpaid)
 *
 * and that can report a payment that never happened. `earnings` comes
 * from `affiliate_referral_stats`, which floors at zero per link AFTER
 * subtracting every clawback in the period. `unpaid` subtracts only the
 * clawbacks not yet attached to a payout. Two different bases, one
 * subtraction.
 *
 * Measured case, dated: PSM0005 with the period set to 24 Sep 2026, as
 * the rows stood that day — two clawbacks created, neither yet attached
 * to a payout. `unpaid` went NEGATIVE, the subtraction added it back,
 * and the tile read "Paid out EUR 4.04" on a day nothing was paid.
 *
 * So it is read, not derived. `affiliate_payouts` is the record of what
 * left the company; a sum of settled rows is the answer, and nothing
 * about clawbacks can move it.
 */

export type PaidRow = {
  status?: string | null;
  currency?: string | null;
  amount?: number | string | null;
  paid_at?: string | null;
};

export type PaidTotals = { eur: number; usd: number };

const r2 = (n: number) => Math.round(n * 100) / 100;

/**
 * `from`/`to` are ISO dates (inclusive). Either may be null for "no
 * bound", which is how the All-time range arrives.
 */
export function paidInPeriod(
  rows: PaidRow[] | null | undefined,
  from?: string | null,
  to?: string | null,
): PaidTotals {
  let eur = 0;
  let usd = 0;
  for (const p of rows ?? []) {
    if (String(p.status ?? "").toLowerCase() !== "paid") continue;
    // A row marked paid with no date cannot be placed in a period. It
    // counts for All-time and for nothing narrower — guessing a date
    // would put real money in the wrong month.
    const at = p.paid_at ? String(p.paid_at).slice(0, 10) : null;
    if (from || to) {
      if (!at) continue;
      if (from && at < from) continue;
      if (to && at > to) continue;
    }
    const amt = Number(p.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    if (String(p.currency ?? "").toUpperCase() === "USD") usd += amt;
    else eur += amt;
  }
  return { eur: r2(eur), usd: r2(usd) };
}
