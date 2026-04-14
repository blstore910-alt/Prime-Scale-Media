import { Tenant } from "./tenant";

export type InvitationStatus =
  | "pending"
  | "accepted"
  | "rejected"
  | "expired"
  | "cancelled";
export type UserInvitation = {
  id: string;
  sender_id: string;
  status: InvitationStatus;
  tenant_id: string;
  tenant_name: string;
  created_at: string;
  updated_at: string;
  sender_profile_id: string;
  email: string;
  tenant: Tenant;
  expires_at: string;
  role: string;
  affiliate_id: string | null;
  commission_type: string | null;
  commission_rate: number | null;
  commission_amount: number | null;
  token: string;
  sender: {
    full_name: string;
    email: string;
  };
};
