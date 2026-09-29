export type Commission = {
  // `idx` used to be declared here and the view has never had it.
  // select("*") never asked, so nothing complained; the first
  // explicit column list turned it into a 400 that emptied
  // /commissions. A type that names a column the relation does not
  // have is a lie waiting for somebody to act on it.
  id: string;
  created_at: string;
  referral_link_id: string;
  tenant_id: string;
  type: string;
  amount: number;
  currency: string;
  status: string | null;
  topup_id: string | null;
  subscription_id: string | null;
  subscription_invoice_id: string | null;
  affiliate_advertiser_tenant_client_code: string | null;
  affiliate_advertiser_email: string | null;
  affiliate_advertiser_name: string | null;
  referred_advertiser_tenant_client_code: string | null;
  referred_advertiser_email: string | null;
  referred_advertiser_name: string | null;
};
