// One row of the ad-account POOL: an ad account the supplier has provisioned
// to us, mirrored on every sync. Unassigned rows (advertiser_id === null) are
// available inventory an admin can allocate to an advertiser.
export interface SupplierAdAccount {
  id: string;
  tenant_id: string;
  provider: string;
  external_id: string;

  name: string | null;
  bm_id: string | null;
  platform: string | null;
  currency: string | null;
  timezone: string | null;
  status: string | null;
  fee_percentage: number | null;
  balance_cents: number | null;
  supplier_assigned_to: string | null;

  ad_account_id: string | null;
  advertiser_id: string | null;
  assigned_at: string | null;
  assigned_by: string | null;
  notes: string | null;

  synced_at: string;
  created_at: string;
  updated_at: string;
}

export type SupplierAdAccountFilter = "all" | "unassigned" | "assigned";
