/**
 * The EUR <-> USD arithmetic, in one place.
 *
 * ──────────────────────────────────────────────────────────────────────
 * WHY THIS IS NOT STILL INSIDE THE DIALOG
 *
 * `getRate` lived as a private const in wallet-exchange-dialog.tsx, so the
 * only screen that could answer "would the other wallet cover this?" was
 * the dialog itself — and by then the customer has already been sent
 * somewhere. The billing card therefore asked a much cruder question,
 * `other > 0`, and offered "Exchange to pay EUR 200.00" to somebody
 * holding one cent, while taking the top-up route away.
 *
 * `exchange_rates.eur` stores "1 USD = N EUR" (USD-based, matching the RPC
 * and the stats routes). USD -> EUR multiplies by it; EUR -> USD divides.
 * ──────────────────────────────────────────────────────────────────────
 */

export type Currency = "USD" | "EUR";

/**
 * The fee the exchange dialog has always shown: 0.6%, taken off the amount
 * that LANDS.
 *
 * NOT VERIFIED AGAINST THE SERVER. `wallet_exchange` is hand-authored on
 * live and its body is not in this repo; I have asked for it. Everything
 * here therefore reproduces exactly what the dialog already renders, so
 * the screen is at least consistent with itself, and the dialog's live
 * preview stays the figure the customer decides on.
 */
export const EXCHANGE_FEE_PCT = 0.006;

export function getRate(
  baseEurRate: number,
  from: Currency,
  to: Currency,
): number {
  if (from === to) return 1;
  if (!Number.isFinite(baseEurRate) || baseEurRate <= 0) return 0;
  if (from === "USD" && to === "EUR") return baseEurRate;
  if (from === "EUR" && to === "USD") return 1 / baseEurRate;
  return 1;
}

/** What actually arrives in the other wallet, after the fee. */
export function landsAfterFee(fromAmount: number, rate: number): number {
  if (!Number.isFinite(fromAmount) || !Number.isFinite(rate)) return 0;
  if (fromAmount <= 0 || rate <= 0) return 0;
  const gross = fromAmount * rate;
  return Math.round(gross * (1 - EXCHANGE_FEE_PCT) * 100) / 100;
}

/**
 * How much has to leave the other wallet for `need` to land.
 *
 * Rounded UP to the cent — rounding down is how "exactly enough" becomes a
 * cent short and the payment it was meant for is refused.
 */
export function neededFromAmount(need: number, rate: number): number {
  if (!Number.isFinite(need) || !Number.isFinite(rate)) return 0;
  if (need <= 0 || rate <= 0) return 0;
  const raw = need / (rate * (1 - EXCHANGE_FEE_PCT));
  return Math.ceil(raw * 100) / 100;
}

/**
 * Would converting the other wallet cover this invoice?
 *
 * `null` means UNKNOWN — no rate has been read. That is not "no": the
 * caller has to keep both routes open rather than print a confident
 * refusal over a read that never completed.
 */
export function otherWalletCovers(
  need: number,
  otherBalance: number,
  rate: number,
): boolean | null {
  if (!Number.isFinite(rate) || rate <= 0) return null;
  if (!Number.isFinite(need) || need <= 0) return true;
  if (!Number.isFinite(otherBalance) || otherBalance <= 0) return false;
  // Compare on the landing side, at the cent, the same way the dialog
  // renders it.
  return landsAfterFee(otherBalance, rate) + 0.0001 >= need;
}
