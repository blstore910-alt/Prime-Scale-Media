export type WithdrawalStatus =
  | "pending"
  | "approved"
  | "rejected"
  | "cancelled";

export interface AdAccountWithdrawal {
  id: string;
  tenant_id: string;
  advertiser_id: string;
  ad_account_id: string;
  wallet_id: string;
  amount: number;
  currency: "USD" | "EUR";
  status: WithdrawalStatus;
  reference: string | null;
  reason: string | null;
  requested_by: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
  // joined for display
  ad_account?: { name: string | null; platform: string | null } | null;
  advertiser?: {
    tenant_client_code: string | null;
    profile?: { full_name: string | null; email: string | null } | null;
  } | null;
}
