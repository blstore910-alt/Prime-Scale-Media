// De standaard ad-accounttypes -- ALLEEN voor de beheerkant (seed bij een
// nieuwe tenant). Uit ad-account-type.ts gehaald: dat laadt ook bij de klant.

import type { AdAccountPlatformGroup } from "./ad-account-type";

export const AD_ACCOUNT_TYPE_SEED: Array<{
  label: string;
  slug: string;
  platform_group: AdAccountPlatformGroup;
  default_fee_pct: number;
  api_topup_enabled: boolean;
  sort_order: number;
}> = [
  { label: "Meta-HK-Premium", slug: "hk-meta-premium", platform_group: "meta", default_fee_pct: 5, api_topup_enabled: false, sort_order: 1 },
  { label: "Meta-HK-Business", slug: "hk-meta-business", platform_group: "meta", default_fee_pct: 5, api_topup_enabled: false, sort_order: 2 },
  { label: "Meta-HK-Business-Green", slug: "hk-meta-business-green", platform_group: "meta", default_fee_pct: 5, api_topup_enabled: false, sort_order: 3 },
  { label: "Meta-EU-Premium", slug: "eu-meta-premium", platform_group: "meta", default_fee_pct: 5, api_topup_enabled: false, sort_order: 4 },
  { label: "Meta-EU-PSM", slug: "eu-meta-psm", platform_group: "meta", default_fee_pct: 5, api_topup_enabled: true, sort_order: 5 },
  { label: "Meta-EU-PSM-GH", slug: "eu-meta-psm-gh", platform_group: "meta", default_fee_pct: 5, api_topup_enabled: false, sort_order: 6 },
  { label: "Google", slug: "google", platform_group: "google", default_fee_pct: 5, api_topup_enabled: false, sort_order: 7 },
  { label: "Tiktok", slug: "tiktok", platform_group: "tiktok", default_fee_pct: 6, api_topup_enabled: false, sort_order: 8 },
];
