export type PerkKind =
  | "free_ad_account_requests"
  | "subscription_waiver"
  | "subscription_discount"
  | "topup_fee_waiver"
  | "topup_discount";

export type AdvertiserPerk = {
  id: string;
  advertiser_id: string;
  tenant_id: string;
  kind: PerkKind;
  amount: number | null;
  remaining: number | null;
  starts_at: string;
  expires_at: string | null;
  active: boolean;
  note: string | null;
  created_at: string;
};

export const PERK_KIND_LABELS: Record<PerkKind, string> = {
  free_ad_account_requests: "Free ad-account requests",
  subscription_waiver: "Free subscription (waiver)",
  subscription_discount: "Subscription discount (%)",
  topup_fee_waiver: "Top-up fee waiver",
  topup_discount: "Top-up fee discount (%)",
};

// Which perks are enforced today (vs. stored for future wiring).
export const PERK_ENFORCED: Record<PerkKind, boolean> = {
  free_ad_account_requests: true,
  subscription_waiver: true,
  subscription_discount: true,
  topup_fee_waiver: false,
  topup_discount: false,
};
