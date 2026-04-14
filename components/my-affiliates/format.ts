import { CURRENCY_SYMBOLS } from "@/lib/constants";

export function formatNumber(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  if (Number.isNaN(num)) return "0.00";

  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);
}

export function formatCurrencyAmount(
  value: number | string | null | undefined,
  currency: string | null | undefined,
) {
  const code = (currency ?? "").toUpperCase();
  const explicitSymbol =
    code === "USD" ? "$" : code === "EUR" ? "€" : undefined;
  const symbol =
    explicitSymbol ??
    CURRENCY_SYMBOLS[code as keyof typeof CURRENCY_SYMBOLS] ??
    (code || "");

  return `${symbol} ${formatNumber(value)}`.trim();
}

export function getCommissionLabel(
  commissionType: string | null | undefined,
  isFirst: boolean | null | undefined,
) {
  if (commissionType === "both" && isFirst) return "Recurring + One Time";
  if (commissionType === "recurring") return "Recurring";
  if (commissionType === "both" && !isFirst) return "Recurring";
  return commissionType || "-";
}
