export type PlanKind = "tier" | "community";
export type PlanCurrency = "EUR" | "USD";

/**
 * The price fields are OPTIONAL on purpose. They come from a migration
 * that is applied by hand, so the code must run correctly against a
 * database that does not have them yet — see the rule in CLAUDE.md. Read
 * them through lib/pure-plan-price.ts, never directly.
 */
export interface PlanPrices {
  monthly_fee_eur?: number | null;
  monthly_fee_usd?: number | null;
  yearly_fee_eur?: number | null;
  yearly_fee_usd?: number | null;
  yearly_discount_pct?: number | null;
}

export interface Plan extends PlanPrices {
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
export interface PlanOption extends PlanPrices {
  id: string;
  name: string;
  kind: PlanKind;
  monthly_fee: number;
  currency: PlanCurrency;
  included_ad_accounts: number;
  topup_fee_pct: number;
}
