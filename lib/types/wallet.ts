export type Wallet = {
  id: string;
  created_at: string;
  updated_at: string | null;
  tenant_id: string | null;
  advertiser_id: string | null;
  usd_balance: number | string | null;
  eur_balance: number | string | null;
  reference_no: number | null;
  min_topup: number | null;
};

export type WalletWithAdvertiser = Wallet & {
  advertiser?: {
    tenant_client_code?: string | null;
    profile?: {
      full_name?: string | null;
      email?: string | null;
    } | null;
  } | null;
};
