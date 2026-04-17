export type CommissionType =
  | "none"
  | "onetime_pct"
  | "monthly_pct"
  | "onetime"
  | "monthly"
  | "pct"
  | "onetime_monthly";

export const COMMISSION_TYPE_OPTIONS: Array<{
  value: CommissionType;
  label: string;
  helper: string;
}> = [
  { value: "none", label: "None", helper: "No commission fields enabled." },
  {
    value: "onetime",
    label: "One Time",
    helper: "Enable commission one time.",
  },
  {
    value: "monthly",
    label: "Monthly Fixed",
    helper: "Enable commission monthly.",
  },
  {
    value: "pct",
    label: "Percentage",
    helper: "Enable commission percent.",
  },
  {
    value: "onetime_pct",
    label: "One Time + Percentage",
    helper: "Enable one time and percent.",
  },
  {
    value: "monthly_pct",
    label: "Monthly Fixed + Percentage",
    helper: "Enable monthly and percent.",
  },
  {
    value: "onetime_monthly",
    label: "Onetime + Monthly",
    helper: "Enable one time and monthly.",
  },
];

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
