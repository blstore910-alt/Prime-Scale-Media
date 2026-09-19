// past_due is written by the dunning run when an auto-debit fails
// (advertiser_perks.sql). It was missing here, so every screen typed
// against this union believed it could not happen — which is why the
// subscriptions action row rendered no buttons for it and the status
// filter could not list it. The one subscription the desk most needs to
// find was the one it could not.
export const SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "inactive",
  "paused",
] as const;

export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export type SubscriptionAdvertiserProfile = {
  full_name: string | null;
  email: string | null;
} | null;

/**
 * The plan an advertiser is on, two hops away: advertiser_plans holds
 * the plan_id, plans holds the name. Optional throughout, because
 * advertiser_plans is a migration that may not be on the database yet
 * and the list asks for it tolerantly.
 *
 * PostgREST returns a to-one embed as an object, but a view or a
 * relationship it reads as to-many comes back as an array — so both
 * shapes are accepted and the reader takes the first.
 */
export type SubscriptionPlanRef =
  | { name: string | null; kind?: string | null }
  | null;

export type SubscriptionAdvertiserPlan =
  | { plan: SubscriptionPlanRef | SubscriptionPlanRef[] }
  | { plan: SubscriptionPlanRef | SubscriptionPlanRef[] }[]
  | null;

export type SubscriptionAdvertiser = {
  tenant_client_code: string | null;
  profile: SubscriptionAdvertiserProfile;
  plan?: SubscriptionAdvertiserPlan;
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
