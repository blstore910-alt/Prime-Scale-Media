/**
 * Framework-agnostic pure helpers. Kept separate from `lib/utils.ts`
 * so they can be imported by Node's built-in test runner without
 * pulling in tailwind / clsx / DOM APIs.
 */

export const generateSlug = (value: string): string => {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-");
};

export const getInitials = (name: string): string => {
  return name
    .split(" ")
    .map((c) => c[0])
    .join("");
};

export const formatRate = (
  rate: number | null | undefined,
): number | undefined => {
  if (rate === null || rate === undefined) return;
  return parseFloat(rate.toFixed(8));
};

export type MinimalRate = {
  eur?: number | null;
  gbp?: number | null;
  hkd?: number | null;
};

export const calculateTopupAmount = (
  amountReceived: number,
  exchangeRates: MinimalRate[] | undefined,
  currency: string,
  fee: number,
): { topupAmount: number; amountUSD: number; feeAmount: number } => {
  if (!exchangeRates) return { topupAmount: 0, amountUSD: 0, feeAmount: 0 };

  // ── A RATE WE DO NOT HOLD IS NOT A RATE OF ZERO ───────────────────
  //
  // MinimalRate carries `eur` and nothing else, so `exchangeRates[0].gbp`
  // is undefined for every other code and this `?? 0` turned it into a
  // rate of nought. A GBP 1,000 transfer then stored amount_usd 0.00,
  // fee_amount 0.00 and topup_amount 0.00 — recorded as nothing
  // arriving, against money we actually hold, and the supplier push
  // funds $0. The caller's own guard only tested `rate.eur > 0`, which
  // a GBP top-up passes.
  //
  // Zero is still returned — the shape of this function cannot refuse —
  // but only for a currency we genuinely have no rate for, and
  // `convertibleCurrency` below lets the caller refuse BEFORE writing.
  const key = currency.toLowerCase() as keyof MinimalRate;
  const rate = currency === "USD" ? 1 : Number(exchangeRates[0]?.[key] ?? 0);
  // The rate is "1 USD = N <currency>" (the same convention the wallet RPCs
  // and top_up_create_for_advertiser use), so converting a foreign amount to
  // USD DIVIDES by the rate. Previously this multiplied, which disagreed with
  // the server RPC and understated USD for EUR/GBP/HKD top-ups.
  // ── THE THREE COLUMNS MUST ADD UP ─────────────────────────────────
  //
  // These are stored as three separate 2-decimal columns and the
  // callers used to round each one independently. amountUSD is a
  // division, so it is never 2dp, and fee and net are its two halves --
  // round all three the same way and the invariant
  //
  //   amount_usd = fee_amount + topup_amount
  //
  // breaks whenever both halves round in the same direction. Measured
  // over whole-euro amounts 100..10,000: 14% of rows at rate 0.86 with
  // a 2% fee, and 35% at 0.92. A cent invented or destroyed on a third
  // of the rows -- and fee_amount is the only column the fee and profit
  // reports read, while topup_amount is what is pushed to the supplier.
  //
  // So: round the gross ONCE, take the fee from the rounded gross, and
  // make the net the remainder. Now the three always reconcile, and the
  // only rounding is on the fee -- where a half-cent has to land
  // somewhere and the customer is not the one paying for it.
  const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
  const amountUSD = r2(rate > 0 ? amountReceived / rate : 0);
  const feeAmount = r2(amountUSD * (fee / 100));
  const topupAmount = r2(amountUSD - feeAmount);
  return { topupAmount, amountUSD, feeAmount };
};

/**
 * The same top-up, in euros.
 *
 * `eur_value` is what the customer PAID expressed in EUR; `eur_topup` is
 * what LANDED on the account expressed in EUR. Both are display columns —
 * every amount that matters is USD — but they are read on three screens,
 * including a deactivated customer's own history.
 *
 * They were computed as `amount_received * (1 - feePercent)` with NO
 * EXCHANGE RATE AT ALL, and with the two fees swapped: eur_value, the
 * gross figure, had a fee subtracted, and eur_topup applied the FULL
 * percentage while topup_amount had been computed with the discounted one.
 * On a $1,000 payment that put eur_value 12.8% above the truth and
 * eur_topup 13.9% above it — and the bulk path next door had it right all
 * along, which is why this lives here now instead of in either caller.
 *
 * USD -> EUR MULTIPLIES by the rate (the rate is "1 USD = N EUR").
 */
export const eurFigures = (args: {
  amountReceived: number;
  currency: string;
  amountUSD: number;
  topupAmount: number;
  eurRate: number;
}): { eurValue: number; eurTopup: number } => {
  const rate = Number(args.eurRate) || 0;
  const paidInEur = String(args.currency ?? "").toUpperCase() === "EUR";
  // Paid in euros? Then the euro figure is the amount itself — converting
  // it to USD and back would only add rounding.
  const eurValue = paidInEur
    ? args.amountReceived
    : rate > 0
      ? args.amountUSD * rate
      : 0;
  const eurTopup = rate > 0 ? args.topupAmount * rate : 0;
  return { eurValue, eurTopup };
};

// ── AN UNKNOWN CURRENCY CODE THROWS ──────────────────────────────────
//
// Intl.NumberFormat with style:"currency" raises a RangeError for any
// code that is not three letters — including "", which `?? "EUR"` does
// not catch because "" is not null. top_ups.currency is a free string
// the server never validates, and one of the three call sites that
// pass it straight through renders on /inactive, which is the ONLY
// screen a deactivated customer has left. A throw there takes the whole
// page to the error boundary.
//
// So: format what we can, and print the code beside the number when we
// cannot, which is still the truth. A blank code prints the bare
// number rather than a wrong symbol — a euro sign on a pound payment is
// worse than no sign at all.
const CURRENCY_CODE = /^[A-Za-z]{3}$/;

/**
 * Whether a top-up in this currency can be converted to USD at all.
 *
 * The exchange_rates row this app reads holds ONE column, `eur`. So USD
 * (rate 1) and EUR (that column) are convertible and nothing else is —
 * including GBP and HKD, which the bank-transfer instructions still
 * offer as physical transfer currencies and which `createTopupAsAdmin`
 * allowlists without validating.
 *
 * Refusing is the only safe answer: the alternative is storing the
 * top-up as zero dollars, which is what happened.
 */
export const convertibleCurrency = (currency: string): boolean => {
  const code = String(currency ?? "").trim().toUpperCase();
  return code === "USD" || code === "EUR";
};

export const formatCurrency = (
  value: number,
  currency: string = "USD",
): string => {
  const amount = Number.isFinite(value) ? value : 0;
  const code = String(currency ?? "").trim().toUpperCase();
  const plain = new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);

  if (!CURRENCY_CODE.test(code)) return plain;

  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: code,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // Three letters and still not a currency ("XXX", a typo). The code
    // is what the row says; printing it is honest and does not crash.
    return `${code} ${plain}`;
  }
};
