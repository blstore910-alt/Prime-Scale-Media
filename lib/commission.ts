// Pure commission arithmetic.
//
// The DB trigger _accrue_referral_commission does its own maths in
// PL/pgSQL, but the same convention is needed on the client to show
// projected earnings ("you'll earn €X on this"). Keep the one source
// of truth for the convention here and test it.
//
// commission_pct is a WHOLE percent (UI input min 0 / max 100), so a
// 10% affiliate on a $500 top-up earns $50.

export type CommissionType = "percentage" | "fixed" | "monthly" | "onetime";

// Returns the commission a percentage-affiliate earns on a single
// top-up, rounded to 2 decimals. Non-percentage types return 0 —
// those are subscription-shaped and not accrued per top-up.
export function percentageCommission(
  topupAmount: number,
  commissionPct: number | null | undefined,
): number {
  const amount = Number(topupAmount);
  const pct = Number(commissionPct);
  if (!Number.isFinite(amount) || amount <= 0) return 0;
  if (!Number.isFinite(pct) || pct <= 0) return 0;
  // Guard against a fraction slipping in where a percent is expected
  // (0.1 would silently pay a tenth of a cent). Percentages are 0–100.
  if (pct > 100) return 0;
  // amount * pct / 100, rounded to 2 decimals:
  // round(amount*pct) / 100 keeps cents exact.
  return Math.round(amount * pct) / 100;
}

// Accrues per top-up only for percentage affiliates. Central so the
// UI and any future projection share the DB trigger's rule.
export function accruesPerTopup(type: CommissionType | string | null): boolean {
  return type === "percentage";
}
