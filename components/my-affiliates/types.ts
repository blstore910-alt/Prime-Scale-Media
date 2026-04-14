export type MyReferral = {
  id: string;
  tenant_id: string;
  referred_advertiser_id: string;
  affiliate_advertiser_id: string;
  commission_type: string | null;
  commission_monthly: number | null;
  commission_pct: number | null;
  commission_onetime: number | null;
  earnings_usd: number | null;
  earnings_eur: number | null;
  referred_advertiser_email: string | null;
  referred_advertiser_name: string | null;
  referred_advertiser_tenant_client_code: string | null;
  affiliate_advertiser_email: string | null;
  affiliate_advertiser_name: string | null;
  affiliate_advertiser_tenant_client_code: string | null;
  affiliate_user_id?: string;
  advertiser_id?: string;
  tenant_client_code?: string | null;
  full_name?: string | null;
  email?: string | null;
};

export type AffiliateCommission = {
  idx: number;
  id: string;
  created_at: string;
  referral_link_id: string | null;
  tenant_id: string;
  type: string | null;
  amount: number | null;
  currency: string | null;
  status: string | null;
  topup_id: string | null;
  subscription_id: string | null;
  subscription_invoice_id: string | null;
};
