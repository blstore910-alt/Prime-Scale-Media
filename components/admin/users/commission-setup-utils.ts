export type CommissionType =
  | "none"
  | "onetime_pct"
  | "monthly_pct"
  | "onetime"
  | "monthly"
  | "pct"
  | "onetime_monthly";

/**
 * WHICH OF THESE ANYTHING ACTUALLY PAYS.
 *
 * `_accrue_referral_commission` is the ONLY writer of
 * referral_commissions in the whole schema, it fires on a verified wallet
 * top-up, and it pays a PERCENTAGE of that top-up. It accrues for
 * commission types that contain a percentage component and returns
 * silently for the rest.
 *
 * So One Time and Monthly Fixed are configurable, are shown as set, and
 * are paid by nothing — no cron, no trigger, no server action. A EUR
 * 200/month fixed deal records zero liability under the words "Commission
 * setup updated". That is a product decision to make, not a bug to patch
 * quietly, so until it is made the screen says so rather than implying a
 * payout that will not arrive.
 *
 * The helper text is what the admin reads at the moment they choose, so
 * it is the right place for it.
 */
export const COMMISSION_TYPE_OPTIONS: Array<{
  value: CommissionType;
  label: string;
  helper: string;
  /** True when a verified top-up actually creates a commission row. */
  accrues: boolean;
}> = [
  {
    value: "none",
    label: "None",
    helper: "No commission for this referral.",
    accrues: false,
  },
  {
    value: "onetime",
    label: "One Time",
    helper: "Recorded on the referral. Paid by hand — nothing accrues it.",
    accrues: false,
  },
  {
    value: "monthly",
    label: "Monthly Fixed",
    helper: "Recorded on the referral. Paid by hand — nothing accrues it.",
    accrues: false,
  },
  {
    value: "pct",
    label: "Percentage",
    helper: "A share of every verified top-up, accrued automatically.",
    accrues: true,
  },
  {
    value: "onetime_pct",
    label: "One Time + Percentage",
    helper:
      "The percentage accrues automatically; the one-time amount is paid by hand.",
    accrues: true,
  },
  {
    value: "monthly_pct",
    label: "Monthly Fixed + Percentage",
    helper:
      "The percentage accrues automatically; the monthly amount is paid by hand.",
    accrues: true,
  },
  {
    value: "onetime_monthly",
    label: "Onetime + Monthly",
    helper: "Both are paid by hand — nothing accrues automatically.",
    accrues: false,
  },
];

/** Does a verified top-up create a commission row for this type? */
export function commissionAccrues(type?: string | null): boolean {
  const t = normalizeCommissionType(type);
  return (
    COMMISSION_TYPE_OPTIONS.find((o) => o.value === t)?.accrues ?? false
  );
}

export function normalizeCommissionType(
  value?: string | null,
): CommissionType {
  switch (value) {
    case "onetime_pct":
    case "monthly_pct":
    case "onetime":
    case "monthly":
    case "pct":
    case "onetime_monthly":
    case "none":
      return value;
    default:
      return "none";
  }
}

export function getCommissionFieldVisibility(type?: string | null) {
  const commissionType = normalizeCommissionType(type);

  return {
    commissionType,
    showPct:
      commissionType === "pct" ||
      commissionType === "onetime_pct" ||
      commissionType === "monthly_pct",
    showOnetime:
      commissionType === "onetime" ||
      commissionType === "onetime_pct" ||
      commissionType === "onetime_monthly",
    showMonthly:
      commissionType === "monthly" ||
      commissionType === "monthly_pct" ||
      commissionType === "onetime_monthly",
    showCurrency: commissionType !== "none",
  };
}
