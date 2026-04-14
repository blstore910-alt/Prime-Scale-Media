type WalletTopupSummary = {
  amount?: number | string | null;
  currency?: string | null;
  status?: string | null;
};

export function getCompletedWalletTopupTotals(
  topups: WalletTopupSummary[] | null | undefined,
) {
  return (topups ?? []).reduce(
    (acc, topup) => {
      if ((topup.status ?? "").toLowerCase() !== "completed") {
        return acc;
      }

      const amount = Number(topup.amount ?? 0);
      if (!Number.isFinite(amount)) {
        return acc;
      }

      const currency = (topup.currency ?? "").toUpperCase();
      if (currency === "EUR") {
        acc.eur += amount;
      }
      if (currency === "USD") {
        acc.usd += amount;
      }

      return acc;
    },
    { eur: 0, usd: 0 },
  );
}
