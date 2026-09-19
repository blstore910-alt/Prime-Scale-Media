export type NotificationType =
  | "topup_completed"
  | "topup_created"
  | "ad_account_request_created"
  | "user_profile_created"
  | "wallet_topup_created"
  | "integration_failure"
  | "subscription_invoice"
  | "subscription_past_due"
  | "subscription_changed"
  | "supplier_low_balance"
  | "supplier_pool_changed"
  | "rate_limit_abuse"
  | "affiliate_application";

export type NotificationAuthor = {
  id: string;
  name: string;
  email: string;
};

export type TopupCompletedNotificationPayload = {
  topup_id: string;
  approved_at?: string;
  author?: NotificationAuthor | null;
};

export type TopupCreatedNotificationPayload = {
  topup_id: string;
};

export type AdAccountRequestCreatedNotificationPayload = {
  ad_account_request_id: string;
};

export type UserProfileCreatedNotificationPayload = {
  profile_id: string;
};

export type WalletTopupCreatedNotificationPayload = {
  wallet_topup_id?: string;
  topup_id?: string;
};

export type IntegrationFailureNotificationPayload = {
  source?: string;
  detail?: string;
};

export type SubscriptionInvoiceNotificationPayload = {
  invoice_id?: string;
  amount?: number;
  currency?: string;
};

export type SubscriptionChangedNotificationPayload = {
  amount?: number;
  currency?: string;
  action?: string;
};

export type SupplierLowBalanceNotificationPayload = {
  currency?: string;
  available?: number;
  threshold?: number;
};

export type RateLimitAbuseNotificationPayload = {
  buckets?: number;
  summary?: string;
};

/** Written by the scheduled pool sync — see lib/integrations/sync-pool.ts. */
export type SupplierPoolChangedNotificationPayload = {
  new_accounts: number;
  status_changes: number;
  summary: string;
};

export type AffiliateApplicationNotificationPayload = {
  applicant_profile_id: string;
  applicant_name: string;
  applicant_email?: string | null;
  advertiser_id?: string | null;
  client_code?: string | null;
};

export interface NotificationPayloadByType {
  topup_completed: TopupCompletedNotificationPayload;
  topup_created: TopupCreatedNotificationPayload;
  ad_account_request_created: AdAccountRequestCreatedNotificationPayload;
  user_profile_created: UserProfileCreatedNotificationPayload;
  wallet_topup_created: WalletTopupCreatedNotificationPayload;
  integration_failure: IntegrationFailureNotificationPayload;
  subscription_invoice: SubscriptionInvoiceNotificationPayload;
  subscription_past_due: SubscriptionInvoiceNotificationPayload;
  subscription_changed: SubscriptionChangedNotificationPayload;
  supplier_low_balance: SupplierLowBalanceNotificationPayload;
  supplier_pool_changed: SupplierPoolChangedNotificationPayload;
  rate_limit_abuse: RateLimitAbuseNotificationPayload;
  affiliate_application: AffiliateApplicationNotificationPayload;
}

export type NotificationPayload =
  | NotificationPayloadByType[NotificationType]
  | Record<string, unknown>;

export interface Notification {
  idx: number;
  id: string;
  created_at: string;
  recipient_user_id?: string | null;
  tenant_id?: string | null;
  actor_user_id?: string | null;
  type: NotificationType | string;
  payload?: string | NotificationPayload | null;
  // Backward compatibility for older rows/clients.
  data?: string | NotificationPayload | null;
  is_read: boolean;
  read_at?: string | null;
}
