/**
 * When an affiliate may ask to be paid.
 *
 * The owner, 22-09: "200 usd of 200 eur ondergrens" — per transfer, per
 * currency they receive. The owner, 25-09: "ik wil pas payout vanaf 200
 * eu, of tenzij admin het vrijgeeft, super admin". So the rule stands and
 * a super-admin can lift it for ONE affiliate.
 *
 * Two readers have to agree on the answer or the screen lies: the card
 * (which enables the button and prints "EUR 184,04 to go") and
 * `affiliate_payout_request_multi` (which refuses). This is the card's
 * half; plak 98 is the RPC's.
 *
 * The distinction that matters is null versus zero. An empty override is
 * "the standing rule applies"; zero is "this one may ask for anything".
 * Collapsing them — which `Number(x) || 200` does — turns a deliberate
 * release into no release at all.
 */

export const STANDING_PAYOUT_MIN = 200;

/** A minimum a super-admin could plausibly have meant. */
export const MAX_PAYOUT_MIN = 100000;

export function payoutMinimumFor(
  override: number | string | null | undefined,
): number {
  if (override === null || override === undefined || override === "") {
    return STANDING_PAYOUT_MIN;
  }
  // PostgREST hands a numeric column back as a STRING, so this arrives as
  // "0.00" where the column was `real`. Number("0.00") is 0, and 0 is a
  // real answer here — see above.
  const n = Number(override);
  if (!Number.isFinite(n) || n < 0) return STANDING_PAYOUT_MIN;
  return Math.round(n * 100) / 100;
}

/** Whether this affiliate is on something other than the standing rule. */
export function isReleased(
  override: number | string | null | undefined,
): boolean {
  if (override === null || override === undefined || override === "") return false;
  const n = Number(override);
  return Number.isFinite(n) && n >= 0 && n !== STANDING_PAYOUT_MIN;
}
