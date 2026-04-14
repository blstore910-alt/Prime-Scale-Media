export const SUBSCRIPTION_STATUSES = ["active", "inactive", "paused"] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type SubscriptionAdvertiserProfile = {
  full_name: string | null;
  email: string | null;
} | null;

export type SubscriptionAdvertiser = {
  tenant_client_code: string | null;
  profile: SubscriptionAdvertiserProfile;
} | null;

export type Subscription = {
  id: string;
  advertiser_id: string;
  tenant_id: string;
  amount: number | string | null;
  start_date: string;
  status: SubscriptionStatus;
  created_at: string;
  updated_at: string;
  currency: "EUR" | "USD";
  advertiser?: SubscriptionAdvertiser;
  next_payment_date?: string | null;
};

export type SubscriptionsQueryParams = {
  status?: SubscriptionStatus | "all";
  date?: string;
  page?: number;
  perPage?: number;
};
