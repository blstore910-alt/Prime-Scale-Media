/**
 * The smallest wallet top-up we will accept from an advertiser.
 *
 * It is not a constant, and it was being treated as one (`minTopup || 300`),
 * which made the very first payment the hardest: a customer who has just
 * signed up and whose plan is not paid yet was told the minimum was €300
 * before they had put a single euro in. The first top-up is exactly the one
 * that should be easy — it is how the plan gets paid at all.
 *
 * So:
 *
 *   plan not active yet   → no minimum. This is the first payment, and the
 *                           whole point of it is to get started.
 *   plan active, NSA      → 250
 *   plan active, anyone   → 300
 *
 * An explicit per-wallet value, set by an admin, always wins. That is a
 * deliberate decision about one customer and it should not be second-guessed
 * by a rule — including when it is 0, which is why "was it set" is tested
 * rather than whether it is truthy.
 */

export const DEFAULT_MIN_TOPUP = 300;

/** Communities with their own floor. Anything unlisted uses the default. */
const COMMUNITY_MIN_TOPUP: Record<string, number> = {
  nsa: 250,
};

export function effectiveMinTopup(input: {
  /** wallets.min_topup — an admin's explicit override, or null/undefined. */
  walletMin?: number | string | null;
  /** Has the subscription actually been paid for and activated? */
  planActive: boolean;
  /** The advertiser's community name, e.g. "NSA". */
  community?: string | null;
}): number {
  // An override that was actually set wins, 0 included. `|| 300` treated a
  // deliberate zero as "unset", which is the same class of bug as a blank
  // input saving as zero elsewhere in this app — here it did the reverse and
  // silently reimposed a floor an admin had removed.
  if (input.walletMin !== null && input.walletMin !== undefined) {
    const n = Number(input.walletMin);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  if (!input.planActive) return 0;

  const key = (input.community ?? "").trim().toLowerCase();
  if (key && key in COMMUNITY_MIN_TOPUP) return COMMUNITY_MIN_TOPUP[key];

  return DEFAULT_MIN_TOPUP;
}
