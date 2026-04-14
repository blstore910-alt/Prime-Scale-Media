export type Invoice = {
  id: string;
  invoice_no: number | string;
  topup_id: string | null;
  wallet_id: string | null;
  account_id: string | null;
  advertiser_id: string | null;
  topup_amount: number | string | null;
  currency: string | null;
  advertiser_name: string | null;
  advertiser_client_code: string | null;
  status: string | null;
  created_at?: string | null;
  updated_at?: string | null;
};
