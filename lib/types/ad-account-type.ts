export type AdAccountPlatformGroup = "meta" | "google" | "tiktok";

// Derive the platform family from a type slug, for consumers that only
// have the slug (form validation, existing account rows). Matches the
// seeded slug convention and any new slug that embeds the keyword.
export function platformGroupFromSlug(
  slug: string,
): AdAccountPlatformGroup | null {
  const s = (slug ?? "").toLowerCase();
  if (s.includes("meta")) return "meta";
  if (s === "google" || s.startsWith("google")) return "google";
  if (s === "tiktok" || s.startsWith("tiktok")) return "tiktok";
  return null;
}

export interface AdAccountType {
  id: string;
  tenant_id: string;
  label: string;
  slug: string;
  platform_group: AdAccountPlatformGroup;
  default_fee_pct: number; // whole percent, 5 = 5% (matches ad_accounts.fee)
  // Auto-topup via the supplier API (Supplier 1) is possible for this type.
  // Only Meta-EU-PSM; every other type is manual.
  api_topup_enabled: boolean;
  // -- ADMIN-ONLY, AND ON A DIFFERENT TABLE FOR IT ------------------
  //
  // Which supplier services this type, where an admin goes to fund one
  // by hand, and what we pay them. These live on
  // ad_account_type_suppliers, NOT on this row: ad_account_types has a
  // read policy for any member of the tenant -- deliberately, so the
  // ad-account create form can list the labels -- so a column here is a
  // column an advertiser can GET over the API. They were on this row
  // for a few hours and a supplier name was entered in that window;
  // 20260920140000 moves them.
  //
  // Carried here as optional fields because the settings screen edits
  // them together with the type; the action reads and writes them
  // against the other table.
  supplier_label?: string | null;
  supplier_url?: string | null;
  /** What WE pay the supplier, as a percent. COST DATA: owner surfaces
   *  only. Null means "not recorded", which is not 0. */
  supplier_fee_pct?: number | null;
  is_active: boolean;
  sort_order: number;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

// Minimal shape the create/update forms need for the dropdown + the
// fee auto-fill. Kept small so the client query stays cheap.
export interface AdAccountTypeOption {
  label: string;
  slug: string;
  platform_group: AdAccountPlatformGroup;
  default_fee_pct: number;
}

// Fallback used by the forms only when the tenant has no types yet
// (pre-seed / brand-new tenant). Mirror of lib/constants.ts PLATFORMS
// with their default fees so the dropdown is never empty.
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
