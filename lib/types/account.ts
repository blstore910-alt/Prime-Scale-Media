import { Advertiser } from "./advertiser";

export interface AdAccount {
  id: string;
  name: string;
  bm_id: string | number | null;
  currency: string | null;
  fee: number;
  // What WE pay the supplier on a top-up for this account, as a percentage.
  // NULL means "not recorded", which is NOT the same as 0 ("they charge us
  // nothing") — margin is only shown when it is actually known.
  supplier_fee_pct?: number | null;
  fee_status: "pending" | "completed" | string;
  advertiser_id: string;
  platform: string;
  airtable: boolean;
  start_date: string;
  created_at?: string;
  updated_at: string;
  payment_status: string | null;
  created_by: string;
  status: string;
  tenant_id: string;
  metadata?: Record<string, unknown> | null;
  notes?: string | null;
  timezone?: string | null;
  website_url?: string | null;
  advertiser?: Advertiser;
  min_topup: number | null;
}
