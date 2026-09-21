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

/** 0.6%, taken off the amount that LANDS — see `exchangeQuote`. */
export const EXCHANGE_FEE_PCT = 0.006;

/**
 * Round to the cent the way Postgres `round(numeric, 2)` does: half away
 * from zero, on the DECIMAL value.
 *
 * `Math.round(x * 100) / 100` does not. 2.675 * 100 is 267.49999999999997
 * in binary floating point, so it rounds DOWN to 2.67 where the database
 * gives 2.68 — and then the screen and the row disagree by a cent on the
 * one figure the customer checks. `toPrecision(12)` collapses that
 * representation error before the rounding decision is made.
 */
function roundCents(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(Number((value * 100).toPrecision(12))) / 100;
}

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

export type ExchangeQuote = {
  /** amount x rate, unrounded — never shown, only rounded downstream. */
  gross: number;
  /** what the fee line says, and what the row stores in `fee_amount`. */
  fee: number;
  /** what lands in the other wallet, and what the row stores as `to_amount`. */
  lands: number;
};

/**
 * What the SERVER will do. Not an approximation of it.
 *
 * ── WHY THIS IS SPELLED OUT STEP BY STEP ─────────────────────────────
 *
 * `wallet_exchange` is hand-authored on live; its body was read off the
 * database on 2026-09-21 and it does exactly this:
 *
 *     v_to_amount_gross := p_amount * v_exchange_rate;
 *     v_fee_amount      := round(v_to_amount_gross * 0.006::numeric, 2);
 *     v_to_amount_net   := round(v_to_amount_gross - v_fee_amount, 2);
 *
 * This file used to compute `round(gross * 0.994, 2)` in one go, which is
 * NOT the same number: rounding the fee to the cent first and subtracting
 * the rounded fee lands a cent higher about half the time. On 50 EUR at
 * 0.872361 the server credits 56.98 and the one-step form says 56.97.
 *
 * That cent is not cosmetic. `otherWalletCovers` decides from it whether
 * the dashboard offers "Exchange to pay EUR 92.00", and the dialog decides
 * from its own copy whether the Exchange button is even pressable — so the
 * two disagreeing is how a customer gets sent to a screen that then
 * refuses them, on an invoice that goes past due while they look at it.
 *
 * Every figure on every screen now comes through here.
 */
export function exchangeQuote(fromAmount: number, rate: number): ExchangeQuote {
  const none = { gross: 0, fee: 0, lands: 0 };
  if (!Number.isFinite(fromAmount) || !Number.isFinite(rate)) return none;
  if (fromAmount <= 0 || rate <= 0) return none;
  const gross = fromAmount * rate;
  const fee = roundCents(gross * EXCHANGE_FEE_PCT);
  const lands = roundCents(gross - fee);
  return { gross, fee, lands };
}

/** What actually arrives in the other wallet, after the fee. */
export function landsAfterFee(fromAmount: number, rate: number): number {
  return exchangeQuote(fromAmount, rate).lands;
}

/**
 * How much has to leave the other wallet for `need` to land.
 *
 * Solved against `exchangeQuote` rather than algebraically: the fee is
 * rounded to the cent before it is subtracted, so the landing amount is a
 * staircase, not a line, and the closed form can sit a cent either side of
 * the step. The estimate below is the starting point; the loop then walks
 * to the SMALLEST amount that genuinely lands `need`.
 *
 * Erring upward is deliberate — rounding down is how "exactly enough"
 * becomes a cent short and the payment it was meant for is refused.
 */
export function neededFromAmount(need: number, rate: number): number {
  if (!Number.isFinite(need) || !Number.isFinite(rate)) return 0;
  if (need <= 0 || rate <= 0) return 0;

  let cents = Math.ceil((need / (rate * (1 - EXCHANGE_FEE_PCT))) * 100);

  // Walk up until it covers. Bounded: the closed form is never more than a
  // couple of cents out, and an unbounded loop on a bad rate would hang the
  // render.
  for (let i = 0; i < 8 && landsAfterFee(cents / 100, rate) < need; i += 1) {
    cents += 1;
  }
  // Then back down while the cent below still covers it, so the customer is
  // never asked for more than the job takes.
  for (let i = 0; i < 8 && cents > 1; i += 1) {
    if (landsAfterFee((cents - 1) / 100, rate) < need) break;
    cents -= 1;
  }
  return cents / 100;
}

/**
 * The rate to PRINT on a statement row.
 *
 * ── THE ROW DID NOT RECONCILE WITH ITSELF ────────────────────────────
 *
 * `wallet_exchanges.exchange_rate` stores whatever `exchange_rates.eur`
 * held at the time, which is always "1 USD = N EUR" — the SAME number
 * whichever way the money went. The statement printed it raw, so an
 * EUR -> USD conversion read:
 *
 *     Exchanged EUR 50.00 to USD at 0.8724        USD 56.98
 *
 * Walked on production. 50 x 0.8724 is 43.62, not 56.98, so a customer
 * checking their own row gets a third number. The rate they actually
 * got was 1.146314, the reciprocal.
 */
export function rateForDirection(from: Currency, storedRate: number): number {
  if (!Number.isFinite(storedRate) || storedRate <= 0) return 0;
  return from === "USD" ? storedRate : 1 / storedRate;
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
  // renders it — and the same way the server will compute it.
  return landsAfterFee(otherBalance, rate) + 0.0001 >= need;
}
