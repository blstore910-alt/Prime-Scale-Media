import { Notification, NotificationType } from "@/lib/types/notification";

type NotificationPayloadObject = Record<string, unknown>;

function asObject(value: unknown): NotificationPayloadObject {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as NotificationPayloadObject;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value
    : null;
}

export function parseNotificationPayload(
  notification: Notification | null | undefined,
): NotificationPayloadObject {
  if (!notification) return {};

  const raw = notification.payload ?? notification.data;
  if (!raw) return {};

  if (typeof raw === "string") {
    try {
      return asObject(JSON.parse(raw));
    } catch {
      return {};
    }
  }

  return asObject(raw);
}

export function getTopupIdFromNotification(
  notification: Notification | null | undefined,
): string | null {
  const payload = parseNotificationPayload(notification);
  return asString(payload.topup_id);
}

export function getAdAccountRequestIdFromNotification(
  notification: Notification | null | undefined,
): string | null {
  const payload = parseNotificationPayload(notification);
  return asString(payload.ad_account_request_id);
}

export function getWalletTopupIdFromNotification(
  notification: Notification | null | undefined,
): string | null {
  const payload = parseNotificationPayload(notification);
  return (
    asString(payload.wallet_topup_id) ??
    asString(payload.topup_id) ??
    asString(payload.wallet_transaction_id)
  );
}

export function getNotificationCopy(notification: Notification): {
  title: string;
  description: string;
} {
  const type = notification.type as NotificationType;

  switch (type) {
    case "topup_completed":
      return {
        title: "Top-up Completed",
        description: "Your top-up has been verified successfully.",
      };
    case "topup_created":
      return {
        title: "Top-up Requires Verification",
        description: "A new top-up request is waiting for admin approval.",
      };
    case "ad_account_request_created":
      return {
        title: "New Ad Account Request",
        description: "Review this request and create an ad account if valid.",
      };
    case "user_profile_created":
      return {
        title: "New User Profile",
        description: "A user profile was created. Click to view users.",
      };
    case "wallet_topup_created":
      return {
        title: "Wallet Top-up Request",
        description: "A wallet top-up is pending approval.",
      };
    default:
      return {
        title: "New Notification",
        description: "You have a new notification.",
      };
  }
}
