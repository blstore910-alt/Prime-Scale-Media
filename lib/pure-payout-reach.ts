// ── CAN THIS AFFILIATE ASK TO BE PAID? ──────────────────────────────
//
// The card has to answer the same question the server will, or the button
// and the refusal disagree — and the refusal is the one that costs
// somebody their afternoon. Two rounds of that have already happened:
//
//   1. the card ignored the 0,6% conversion fee, so it turned green and
//      affiliate_payout_request_multi came back "A payout starts at
//      EUR 200 — this one is EUR 120,00", with nothing recorded.
//   2. the card then took the fee off the WHOLE sum, including the pot
//      already in the receiving currency. The server does not: read off
//      the live definition, v_fee_pct is 0 and stays 0 when
//      `v_pay_cur = 'SAME' or v_pay_cur = v_cur`, and the 0,60 is applied
//      per leg to the converted amount only. So it refused requests that
//      were good — EUR 199 + $1,50 arrives as EUR 200,30 and passes.
//
// Which is why this is a module with tests rather than four lines inside a
// component. The rounding matters too: the server rounds the conversion,
// then rounds the fee, then rounds the difference. Rounding once at the
// end is a different number.

export type Cur = "EUR" | "USD";

/** The conversion fee, in percent. Mirrors v_fee_pct in the RPC. */
export const PAYOUT_FEE_PCT = 0.6;

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

/**
 * What one pot arrives as, in the currency it is being paid in.
 *
 * `rate` is EUR per 1 USD, the same direction as `exchange_rates.eur`.
 * A pot paid out in its own currency is not converted and carries no fee.
 * Returns null when a conversion is needed and there is no usable rate —
 * never 0, because "we cannot work it out" and "it is worth nothing" are
 * different answers and only one of them is a reason to refuse.
 */
export function payoutLeg(
  amount: number,
  from: Cur,
  to: Cur,
  rate: number | null | undefined,
): { gross: number; fee: number; net: number } | null {
  const a = Number(amount);
  if (!Number.isFinite(a) || a <= 0) return { gross: 0, fee: 0, net: 0 };
  if (from === to) return { gross: a, fee: 0, net: a };
  const r = Number(rate);
  if (!Number.isFinite(r) || r <= 0) return null;
  // Step for step as the RPC does it: convert, round, take the fee off
  // the rounded figure, round that, subtract, round again.
  const gross = round2(from === "USD" ? a * r : a / r);
  const fee = round2((gross * PAYOUT_FEE_PCT) / 100);
  return { gross, fee, net: round2(gross - fee) };
}

/**
 * Everything the two pots arrive as when paid in one currency.
 *
 * null when a leg that needs converting has no rate — see payoutLeg.
 */
export function payoutTotal(
  owed: { EUR: number; USD: number },
  to: Cur,
  rate: number | null | undefined,
): number | null {
  let sum = 0;
  for (const from of ["EUR", "USD"] as Cur[]) {
    const leg = payoutLeg(owed[from], from, to, rate);
    // A pot of nothing never needs a rate, so it must not block the other.
    if (leg === null) {
      if (Number(owed[from]) > 0) return null;
      continue;
    }
    sum += leg.net;
  }
  return round2(sum);
}

export type PayoutReach = {
  /** Can a request pass at all, any way round? */
  reachable: boolean;
  /** EUR 200 on its own, no conversion, no fee. */
  sameEur: boolean;
  sameUsd: boolean;
  /** Both pots converted into one currency, per leg, as the RPC does. */
  bestEur: number | null;
  bestUsd: number | null;
  /**
   * Only reachable by adding the two together — neither pot clears the
   * floor alone. Then step 2 must not open on "keep them separate", which
   * is the one option the server is going to refuse.
   */
  onlyByConverting: boolean;
  /** The currency to QUOTE: the one that actually passes, or, short of the
   *  floor, whichever comes closest. Quoting EUR either way was its own
   *  fault — at 0,872361 bestEur is always the smaller of the two, so an
   *  affiliate who only cleared the floor in dollars read "about EUR
   *  174,47 — enough for a payout" under a card that had just said
   *  payouts start at 200. */
  quoteCurrency: Cur;
  quoteAmount: number | null;
};

/**
 * The whole verdict, off the two pots, the floor and the rate.
 *
 * `min` is this affiliate's floor — 200 unless the owner released them,
 * see lib/pure-payout-min.ts. It is the same number for both currencies,
 * per the owner: "200 usd of 200 eur ondergrens".
 */
export function payoutReach(
  owed: { EUR: number; USD: number },
  min: number,
  rate: number | null | undefined,
): PayoutReach {
  const eur = Number(owed.EUR) || 0;
  const usd = Number(owed.USD) || 0;
  const sameEur = eur >= min;
  const sameUsd = usd >= min;
  const bestEur = payoutTotal({ EUR: eur, USD: usd }, "EUR", rate);
  const bestUsd = payoutTotal({ EUR: eur, USD: usd }, "USD", rate);
  const convEur = bestEur !== null && bestEur >= min;
  const convUsd = bestUsd !== null && bestUsd >= min;
  const reachable = sameEur || sameUsd || convEur || convUsd;
  const onlyByConverting = !sameEur && !sameUsd && reachable;

  // Which figure to put on the screen.
  let quoteCurrency: Cur = "EUR";
  let quoteAmount: number | null = bestEur;
  if (convEur) {
    quoteCurrency = "EUR";
    quoteAmount = bestEur;
  } else if (convUsd) {
    quoteCurrency = "USD";
    quoteAmount = bestUsd;
  } else if (bestEur !== null && bestUsd !== null) {
    // Short of it: the side that is nearest, because that is the one the
    // next commission carries over the line.
    const nearUsd = min - bestUsd < min - bestEur;
    quoteCurrency = nearUsd ? "USD" : "EUR";
    quoteAmount = nearUsd ? bestUsd : bestEur;
  } else if (bestUsd !== null) {
    quoteCurrency = "USD";
    quoteAmount = bestUsd;
  }

  return {
    reachable,
    sameEur,
    sameUsd,
    bestEur,
    bestUsd,
    onlyByConverting,
    quoteCurrency,
    quoteAmount,
  };
}
