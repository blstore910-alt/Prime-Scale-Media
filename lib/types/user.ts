import { Advertiser } from "./advertiser";

export type User = {
  id: string;
  display_name: string;
  email: string;
};
export type Tenant = {
  id: string;
  name: string;
  slug?: string | null;
  initials: string;
  last_client_code: number;
  owner_id?: string | null;
};
export interface UserProfile {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  created_at: string;
  updated_at: string;
  tenant?: Tenant;
  email: string;
  is_active: boolean;
  full_name: string;
  advertiser?: Advertiser[];
  status: string;
  referred_by?: string;
  heard_from?: string;
  referral_status?: string;
}

export type UserRole = "admin" | "advertiser";
