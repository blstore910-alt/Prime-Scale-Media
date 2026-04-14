export type NotificationType =
  | "topup_completed"
  | "topup_created"
  | "ad_account_request_created"
  | "user_profile_created"
  | "wallet_topup_created";

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

export interface NotificationPayloadByType {
  topup_completed: TopupCompletedNotificationPayload;
  topup_created: TopupCreatedNotificationPayload;
  ad_account_request_created: AdAccountRequestCreatedNotificationPayload;
  user_profile_created: UserProfileCreatedNotificationPayload;
  wallet_topup_created: WalletTopupCreatedNotificationPayload;
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
