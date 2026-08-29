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
  const amountUSD = amountReceived * rate;
  const feeAmount = amountUSD * (fee / 100);
  const topupAmount = amountUSD - feeAmount;
  return { topupAmount, amountUSD, feeAmount };
};

export const formatCurrency = (
  value: number,
  currency: string = "USD",
): string => {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(value);
};
