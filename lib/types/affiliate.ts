import { Advertiser } from "./advertiser";

export type Affiliate = {
  id: string;
  affiliate: Advertiser | null;
  advertiser: Advertiser;
  status: string;
  created_at: string;
  tenant_id: string;
  currency: string;
  payment_status?: "paid" | "unpaid";
  fee_commission?: boolean;
  commission_type: string;
  commission_rate: number;
  commission_amount: number;
  usd_earnings: number;
  eur_earnings: number;
};
