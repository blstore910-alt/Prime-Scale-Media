import { UserProfile } from "./user";
import { WalletTopup } from "./wallet-topup";

export type Advertiser = {
  id: string;
  user_id: string;
  tenant_id: string;
  created_at: string;
  updated_at: string;
  profile_id: string;
  tenant_client_code: string;
  profile: UserProfile;
  startup_fee: number;
  fee_status: string;
  airtable: boolean;
  commission_type?: string | null;
  commission_pct?: number | null;
  commission_onetime?: number | null;
  commission_monthly?: number | null;
  commission_currency?: string | null;
  wallet_topups?: Pick<WalletTopup, "amount" | "currency" | "status">[];
  subscriptions?: { status: string }[];
};
