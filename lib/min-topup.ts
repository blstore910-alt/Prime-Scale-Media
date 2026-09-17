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
 *
 * ⚠️ THE SERVER SHARES THIS RULE. wallet_topup_advertiser_create enforces
 * its own copy, in SQL, and for a while it did not: it read
 * wallets.min_topup directly, and that column defaults to 300. So this file
 * told a new customer there was no minimum, took their bank details, took
 * their payment slip — and the RPC threw "Amount below minimum" on submit,
 * after the transfer had already been made. If you change the rule here,
 * change it in supabase/migrations/20260917230000_first_topup_has_no_minimum.sql
 * too. A client-side rule the server does not share is not a rule, it is a
 * trap.
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
  // Before the plan is active there is NO minimum, and the stored value does
  // not get a say. This is deliberate and it is the whole point: wallets are
  // created with min_topup = 300 as a column default, which is
  // indistinguishable from an admin having typed 300 — so honouring "the
  // stored value wins" here put the €300 floor straight back on the one
  // payment that must not have a floor. A default is not a decision.
  if (!input.planActive) return 0;

  // Once the plan IS running, a stored value is a decision about this
  // customer and wins — 0 included. `|| 300` treated a deliberate zero as
  // unset and silently reimposed a floor an admin had removed.
  if (input.walletMin !== null && input.walletMin !== undefined) {
    const n = Number(input.walletMin);
    if (Number.isFinite(n) && n >= 0) return n;
  }

  const key = (input.community ?? "").trim().toLowerCase();
  if (key && key in COMMUNITY_MIN_TOPUP) return COMMUNITY_MIN_TOPUP[key];

  return DEFAULT_MIN_TOPUP;
}
