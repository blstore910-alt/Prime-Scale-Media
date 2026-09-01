export type PlanKind = "tier" | "community";
export type PlanCurrency = "EUR" | "USD";

export interface Plan {
  id: string;
  tenant_id: string;
  name: string;
  kind: PlanKind;
  monthly_fee: number;
  currency: PlanCurrency;
  included_ad_accounts: number;
  topup_fee_pct: number;
  is_active: boolean;
  sort_order: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// Minimal shape the invite form needs to pre-fill from a chosen preset.
export interface PlanOption {
  id: string;
  name: string;
  kind: PlanKind;
  monthly_fee: number;
  currency: PlanCurrency;
  included_ad_accounts: number;
  topup_fee_pct: number;
}
