export type FeeDefaultPlatform = "meta-ads" | "tiktok-ads" | "google-ads";
export type FeeDefaultCurrency = "USD" | "EUR";

export interface FeeDefault {
  id: string;
  tenant_id: string;
  platform: FeeDefaultPlatform;
  currency: FeeDefaultCurrency;
  fee_pct: number; // fraction, 0.05 = 5%
  is_active: boolean;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// Hardcoded fallback used only when no fee_defaults row exists for a
// (platform, currency) pair — a fresh tenant on its first topup, or a
// platform added after seed. Every fee ultimately shown to a customer
// should still trace back to a fee_defaults row; the fallback is a
// safety net, not an authoritative source.
export const FEE_DEFAULT_FALLBACK_PCT = 0.05;

// Seeded on first admin visit if no rows exist for the tenant. Mirror
// of what advertisers used to see hardcoded on the old dashboard.
export const FEE_DEFAULT_SEED: Array<{
  platform: FeeDefaultPlatform;
  currency: FeeDefaultCurrency;
  fee_pct: number;
}> = [
  { platform: "meta-ads", currency: "USD", fee_pct: 0.05 },
  { platform: "meta-ads", currency: "EUR", fee_pct: 0.05 },
  { platform: "tiktok-ads", currency: "USD", fee_pct: 0.06 },
  { platform: "google-ads", currency: "USD", fee_pct: 0.05 },
];
