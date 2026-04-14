export type WalletTopup = {
  id: string;
  created_at: string;
  updated_at: string | null;
  tenant_id: string | null;
  advertiser_id: string | null;
  wallet_id: string | null;
  currency: string | null;
  amount: number;
  status: string | null;
  reference_no: string | number | null;
  notes: string | null;
  payment_slip?: string | null;
  rejection_reason?: string | null;
  created_by: string | null;
  approved_by: string | null;
};

export type WalletTopupWithAdvertiser = WalletTopup & {
  advertiser?: {
    tenant_client_code?: string | null;
    profile?: {
      full_name?: string | null;
      email?: string | null;
    } | null;
  } | null;
};
