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

  const key = currency.toLowerCase() as keyof MinimalRate;
  const rate = currency === "USD" ? 1 : Number(exchangeRates[0]?.[key] ?? 0);
  // The rate is "1 USD = N <currency>" (the same convention the wallet RPCs
  // and top_up_create_for_advertiser use), so converting a foreign amount to
  // USD DIVIDES by the rate. Previously this multiplied, which disagreed with
  // the server RPC and understated USD for EUR/GBP/HKD top-ups.
  const amountUSD = rate > 0 ? amountReceived / rate : 0;
  const feeAmount = amountUSD * (fee / 100);
  const topupAmount = amountUSD - feeAmount;
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

export const formatCurrency = (
  value: number,
  currency: string = "USD",
): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
};
