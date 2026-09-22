export type NotificationType =
  | "topup_completed"
  | "wallet_topup_completed"
  | "wallet_topup_rejected"
  | "topup_created"
  | "ad_account_request_created"
  | "user_profile_created"
  | "wallet_topup_created"
  | "integration_failure"
  | "subscription_invoice"
  | "subscription_invoice_paid"
  | "subscription_past_due"
  | "subscription_invoice_due_soon"
  | "subscription_changed"
  | "supplier_low_balance"
  | "billing_run_failed"
  | "topup_rejected"
  | "withdrawal_approved"
  | "withdrawal_rejected"
  | "request_fee_refunded"
  | "supplier_pool_changed"
  | "rate_limit_abuse"
  | "affiliate_application"
  // Plak 35: commission is booked on profit, per the owner's rules.
  | "referral_commission_earned"
  | "referral_commission_on_hold"
  | "referral_commission_failed"
  // Plak 36: deleting an account is a request the owner decides.
  | "account_deletion_requested"
  | "account_deletion_declined"
  // Plak 42: a referral waits for the owner; approving counts back.
  | "referral_pending"
  | "referral_joined"
  | "referral_approved"
  | "referral_rejected"
  | "affiliate_approved"
  | "affiliate_refused"
  // Plak 43: an affiliate account asking to advertise too.
  | "affiliate_upgrade_requested"
  | "affiliate_upgrade_approved"
  | "affiliate_upgrade_refused";

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
  account_deletion_requested: {
    profile_id?: string | null;
    name?: string | null;
    email?: string | null;
    client_code?: string | null;
  };
  account_deletion_declined: { reason?: string | null };
  /** To the owner: somebody signed up through an affiliate's link. */
  referral_pending: {
    link_id?: string | null;
    affiliate_advertiser_id?: string | null;
    affiliate_code?: string | null;
    affiliate_name?: string | null;
    client_code?: string | null;
    name?: string | null;
  };
  /** To the affiliate: a new customer through their link. */
  referral_joined: { client_code?: string | null; pending?: boolean | null };
  /** To the affiliate: approved, with what that booked at once. */
  referral_approved: {
    client_code?: string | null;
    name?: string | null;
    booked_eur?: number | string | null;
    booked_usd?: number | string | null;
  };
  referral_rejected: { client_code?: string | null };
  affiliate_approved: Record<string, never>;
  affiliate_refused: { reason?: string | null };
  affiliate_upgrade_requested: {
    advertiser_id?: string | null;
    client_code?: string | null;
    name?: string | null;
    email?: string | null;
  };
  affiliate_upgrade_approved: Record<string, never>;
  affiliate_upgrade_refused: { reason?: string | null };
  /** Plak 35: booked on profit (top-up), a paid plan invoice, or a new
   *  customer's first top-up (one-time). Written by the accrual triggers. */
  referral_commission_earned: {
    amount?: number | string | null;
    currency?: string | null;
    client_code?: string | null;
    source?: "topup" | "subscription" | "onetime" | string | null;
  };
  referral_commission_on_hold: {
    topup_id?: string | null;
    reason?: string | null;
  };
  referral_commission_failed: {
    topup_id?: string | null;
    invoice_id?: string | null;
    error?: string | null;
  };
  topup_completed: TopupCompletedNotificationPayload;
  topup_created: TopupCreatedNotificationPayload;
  ad_account_request_created: AdAccountRequestCreatedNotificationPayload;
  user_profile_created: UserProfileCreatedNotificationPayload;
  wallet_topup_created: WalletTopupCreatedNotificationPayload;
  integration_failure: IntegrationFailureNotificationPayload;
  subscription_invoice: SubscriptionInvoiceNotificationPayload;
  /** An invoice settled from the wallet — pressed by them, or collected
      by the due-date run, which is the case they cannot see coming. */
  subscription_invoice_paid: {
    invoice_id?: string | null;
    number?: string | number | null;
    amount?: number | string | null;
    currency?: string | null;
  };
  subscription_past_due: SubscriptionInvoiceNotificationPayload;
  /** A few days before the due-date run takes an open invoice. */
  subscription_invoice_due_soon: {
    invoice_id?: string | null;
    number?: string | number | null;
    amount?: number | string | null;
    currency?: string | null;
    due_date?: string | null;
  };
  subscription_changed: SubscriptionChangedNotificationPayload;
  supplier_low_balance: SupplierLowBalanceNotificationPayload;
  /** The nightly billing run refused. Nobody was invoiced or
   *  debited that night -- the RPC is one transaction. */
  /** An ad-account top-up we refused. The reason is the customer's. */
  topup_rejected: {
    topup_id?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    reason?: string | null;
  };
  /** Money returned from an ad account to their wallet. */
  withdrawal_approved: {
    amount?: number | string | null;
    currency?: string | null;
    account_name?: string | null;
  };
  /** A withdrawal we could not make. The reason is the customer's. */
  withdrawal_rejected: {
    amount?: number | string | null;
    currency?: string | null;
    account_name?: string | null;
    reason?: string | null;
  };
  /** The ad-account request fee, put back after a refusal. */
  request_fee_refunded: {
    amount?: number | string | null;
    currency?: string | null;
    reason?: string | null;
  };
  /** Money the customer wired, confirmed and credited. */
  wallet_topup_completed: {
    wallet_topup_id?: string | null;
    amount?: number | string | null;
    currency?: string | null;
  };
  /** A transfer we could not confirm. The reason is the customer's. */
  wallet_topup_rejected: {
    wallet_topup_id?: string | null;
    amount?: number | string | null;
    currency?: string | null;
    reason?: string | null;
  };
  billing_run_failed: {
    code?: string | null;
    reason?: string | null;
    at?: string | null;
  };
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
