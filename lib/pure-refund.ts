/**
 * HOW MUCH OF A CUSTOMER'S MONEY WE COULD GIVE BACK.
 *
 * The owner, 29-09: "refunds moeten we dus ook kunnen calculaten, alle
 * topups etc - onze fees en dan wat overblijft is de max refund."
 *
 * ── THE RULE, AND WHY IT IS NOT JUST "THE WALLET BALANCE" ─────────
 *
 * The obvious answer is "give back what is in the wallet", and it is
 * wrong in both directions.
 *
 * Too HIGH, because a wallet can hold money that was never paid in:
 * an advance credit (precharge) we extended before the transfer
 * cleared, or an admin correction. Refunding that sends out money that
 * never arrived.
 *
 * Too LOW, because money sitting on an ad account has not been spent.
 * It is still the customer's, it is just not in the wallet. Refusing
 * to count it tells a customer they cannot have money that is
 * demonstrably theirs.
 *
 * So the ceiling is built from what actually came IN, less what is
 * genuinely ours or genuinely gone:
 *
 *     paid in            every completed top-up
 *   - our fees           the funding fee, subscriptions, DST
 *   - spent              ad spend that has left for the supplier
 *   - already refunded   what has gone back out before
 *   - outstanding credit advances not yet settled
 *   ─────────────────────────────────────────────────────────
 *   = the most we could return
 *
 * ── AND IT IS A CEILING, NOT AN INSTRUCTION ───────────────────────
 *
 * It answers "what is the most this could be", which is the question
 * somebody reviewing a refund needs answered before they look at the
 * request. It does not decide anything. A refund still needs a person,
 * and this number is there so that person can see at a glance whether
 * the amount asked for is even possible.
 *
 * Currencies are never mixed. A EUR ceiling and a USD ceiling are two
 * different answers, because converting them needs a rate and a rate
 * picked today changes last month's figure.
 */

export type RefundBasis = {
  /** Every completed top-up, in this currency. */
  paidIn: number;
  /** The funding fee we charged, plus subscriptions and DST. Ours. */
  ourFees: number;
  /** Ad spend that has gone to the supplier. Not coming back. */
  spent: number;
  /** Refunds already sent out. */
  alreadyRefunded: number;
  /** Advance credit extended and not yet settled. Never arrived. */
  outstandingCredit: number;
};

export type RefundCeiling = {
  max: number;
  /** Each step, so the screen can show the subtraction rather than a
   *  bare number somebody has to trust. */
  steps: { label: string; amount: number; subtract: boolean }[];
  /** Set when the arithmetic produced something that needs a human. */
  warning: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

/** A figure that is not a finite number is not a zero. */
const safe = (n: number) => (Number.isFinite(n) ? n : 0);

export function refundCeiling(b: RefundBasis): RefundCeiling {
  const paidIn = r2(safe(b.paidIn));
  const ourFees = r2(safe(b.ourFees));
  const spent = r2(safe(b.spent));
  const alreadyRefunded = r2(safe(b.alreadyRefunded));
  const outstandingCredit = r2(safe(b.outstandingCredit));

  const raw = r2(paidIn - ourFees - spent - alreadyRefunded - outstandingCredit);

  // ── A NEGATIVE CEILING IS NOT A NEGATIVE REFUND ─────────────────
  //
  // It means we have already given back, charged, or advanced more
  // than came in — which is either a mistake or a customer in debt to
  // us. Clamping it to zero silently is how that stays invisible, so
  // the number is clamped AND the fact is carried out in the warning.
  const max = Math.max(0, raw);

  return {
    max,
    steps: [
      { label: "Paid in (completed top-ups)", amount: paidIn, subtract: false },
      { label: "Our fees, subscriptions and DST", amount: ourFees, subtract: true },
      { label: "Spent on ads (gone to the supplier)", amount: spent, subtract: true },
      { label: "Already refunded", amount: alreadyRefunded, subtract: true },
      {
        label: "Advance credit not yet settled",
        amount: outstandingCredit,
        subtract: true,
      },
    ].filter((s) => s.amount !== 0 || !s.subtract),
    warning:
      raw < 0
        ? `More has been charged, refunded or advanced than this customer ever paid in, by ${r2(-raw).toFixed(2)}. Nothing can be refunded until somebody works out why.`
        : null,
  };
}

/**
 * What the wallet says against what the ceiling says.
 *
 * These two are allowed to differ — the ceiling counts money on ad
 * accounts, the balance does not — but a balance ABOVE the ceiling is
 * worth looking at: it means the wallet holds money that did not come
 * from a top-up.
 */
export function refundFlag(
  walletBalance: number,
  ceiling: number,
): { level: "ok" | "look"; note: string | null } {
  const b = r2(safe(walletBalance));
  const c = r2(safe(ceiling));
  if (b > c) {
    return {
      level: "look",
      note: `The wallet holds ${r2(b - c).toFixed(2)} more than could be refunded. That is money in the wallet that did not arrive as a top-up — an advance, an adjustment, or money back off an ad account.`,
    };
  }
  return { level: "ok", note: null };
}
