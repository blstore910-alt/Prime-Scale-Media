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
    case "supplier_low_balance":
      return {
        title: "Supplier balance low",
        description:
          "The ad-account supplier's spendable balance is below the threshold — top up soon.",
      };
    case "supplier_pool_changed": {
      // The scheduled pool sync builds a real summary — "2 new ad account(s)
      // in the pool · seamx-9001: active → suspended" — and this map did not
      // know the type, so every one of them rendered as the default "You have
      // a new notification." The whole point of only notifying when something
      // changed is to say WHAT changed.
      const p = (notification.payload ?? {}) as {
        summary?: string;
        new_accounts?: number;
        status_changes?: number;
      };
      const added = Number(p.new_accounts ?? 0);
      const changed = Number(p.status_changes ?? 0);
      const parts: string[] = [];
      if (added) parts.push(`${added} new`);
      if (changed) parts.push(`${changed} changed status`);
      return {
        title: parts.length
          ? `Ad account pool: ${parts.join(", ")}`
          : "Ad account pool updated",
        description:
          p.summary ||
          "The supplier's inventory changed — open the pool to see what is free to allocate.",
      };
    }
    // ── THE THREE THE CUSTOMER GETS MOST ──────────────────────────────
    //
    // This function is what the live customer shells render
    // (adv-app and aff-app both call it), and it had no case for any of
    // the billing types — so "we couldn't collect your subscription"
    // arrived as "New Notification / You have a new notification." under
    // an empty state promising that billing updates would appear here.
    // The PUSH copy for these has been right all along; the in-app copy
    // was the default.
    case "subscription_invoice":
      return {
        title: "New subscription invoice",
        description:
          "Your monthly invoice is ready. You can pay it from your wallet whenever suits you.",
      };
    case "subscription_past_due":
      return {
        title: "Subscription past due",
        description:
          "We couldn't collect your subscription from your wallet. Top up and it will be taken automatically.",
      };
    case "subscription_changed":
      return {
        title: "Subscription updated",
        description:
          "The amount on your subscription has changed. Open billing to see what is due.",
      };
    case "integration_failure": {
      // Admin-facing. The payload names the service; saying which one is
      // the entire difference between acting and ignoring it.
      const p = (notification.payload ?? {}) as { source?: string };
      const source = typeof p.source === "string" && p.source ? p.source : null;
      return {
        title: "Connection failing",
        description: source
          ? `A connection to ${source} is failing. The manual fallback still works.`
          : "A connection to an external service is failing. The manual fallback still works.",
      };
    }
    case "rate_limit_abuse":
      return {
        title: "Suspicious activity",
        description:
          "Someone hit a rate limit on a sensitive action — check the activity log if this is unexpected.",
      };
    default:
      return {
        title: "New Notification",
        description: "You have a new notification.",
      };
  }
}
