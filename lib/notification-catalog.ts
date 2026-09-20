import type { NotificationType } from "@/lib/types/notification";

// Which audience each notification type is meant for. "customer" =
// advertiser + affiliate end-users; "admin" = admin + super-admin (the
// super-admin is just the tenant-owning admin, see lib/permissions.ts).
export type NotificationAudience = "customer" | "admin";

export type NotificationCatalogEntry = {
  type: NotificationType;
  label: string;
  description: string;
  audience: NotificationAudience;
};

// The user-facing catalog that drives the preferences UI. Only types a
// given role can actually receive are shown to that role, so the list
// always reflects reality instead of dangling dead toggles.
export const NOTIFICATION_CATALOG: NotificationCatalogEntry[] = [
  {
    type: "affiliate_application",
    label: "Affiliate application",
    description:
      "When an advertiser asks to join the affiliate program and needs commission terms.",
    audience: "admin",
  },
  {
    type: "topup_completed",
    label: "Top-up completed",
    description: "When one of your top-ups is confirmed and credited.",
    audience: "customer",
  },
  {
    type: "subscription_invoice",
    label: "Subscription invoice",
    description: "When a new monthly subscription invoice is issued.",
    audience: "customer",
  },
  {
    type: "subscription_past_due",
    label: "Subscription past due",
    description: "When a subscription payment couldn't be collected.",
    audience: "customer",
  },
  {
    type: "subscription_changed",
    label: "Subscription changed",
    description: "When your subscription amount is updated.",
    audience: "customer",
  },
  {
    type: "topup_created",
    label: "New top-up request",
    description: "When a customer submits a top-up that needs verifying.",
    audience: "admin",
  },
  {
    type: "wallet_topup_created",
    label: "New wallet top-up",
    description: "When a customer requests a wallet top-up.",
    audience: "admin",
  },
  {
    type: "ad_account_request_created",
    label: "New ad-account request",
    description: "When a customer requests a new ad account.",
    audience: "admin",
  },
  {
    type: "user_profile_created",
    label: "New user signup",
    description: "When someone accepts an invite and joins.",
    audience: "admin",
  },
  {
    type: "integration_failure",
    label: "Integration / connection issue",
    description:
      "When an external connection starts failing. Manual fallback is always available.",
    audience: "admin",
  },
  {
    type: "supplier_low_balance",
    label: "Supplier balance low",
    description:
      "When the ad-account supplier's spendable balance drops below the safety threshold.",
    audience: "admin",
  },
  {
    type: "topup_rejected",
    label: "Ad-account top-up refused",
    description:
      "When we cannot put money on one of your ad accounts. The reason is included.",
    audience: "customer",
  },
  {
    type: "withdrawal_approved",
    label: "Money returned to your wallet",
    description:
      "When money you asked back from an ad account has landed in your wallet.",
    audience: "customer",
  },
  {
    type: "request_fee_refunded",
    label: "Ad-account request refunded",
    description:
      "When a request we could not fulfil is refunded to your wallet.",
    audience: "customer",
  },
  {
    type: "billing_run_failed",
    label: "Billing run failed",
    description:
      "When the nightly subscription billing run did not complete. Nobody was invoiced or debited that night — it is safe to re-run, but it will not fix itself.",
    audience: "admin",
  },
  {
    type: "supplier_pool_changed",
    label: "Ad-account pool changed",
    description:
      "When new accounts or status changes arrive from the supplier. This fires on a 15-minute cycle, so it is the noisiest one here.",
    audience: "admin",
  },
  {
    type: "rate_limit_abuse",
    label: "Suspicious activity (rate limit)",
    description:
      "When someone hits a rate limit on a sensitive action (signups, invites, financial requests) — possible abuse.",
    audience: "admin",
  },
];

// Map a profile role to the audience whose toggles they should see.
export function audienceForRole(
  role: string | null | undefined,
): NotificationAudience {
  return role === "admin" ? "admin" : "customer";
}

export function catalogForRole(
  role: string | null | undefined,
): NotificationCatalogEntry[] {
  const audience = audienceForRole(role);
  return NOTIFICATION_CATALOG.filter((e) => e.audience === audience);
}

/**
 * Is this type safe to render on a CUSTOMER's screen?
 *
 * ── WHY THIS HAS TO EXIST ────────────────────────────────────────────
 *
 * `audience` was declared for every type and read by exactly one thing:
 * the preferences UI. Delivery never consulted it. getNotificationCopy
 * prints `payload.summary` verbatim for `supplier_pool_changed`, and the
 * format its own comment gives is
 *
 *     "2 new ad account(s) in the pool · seamx-9001: active → suspended"
 *
 * -- the supplier's name and their account ids. That function is
 * rendered by BOTH customer shells, and the push route switches on
 * `type` alone and pushes to whatever `recipient_user_id` says.
 *
 * So the only thing keeping the supplier off a customer's screen was
 * the two insert sites choosing their recipients correctly. One
 * mis-addressed row -- a hand-run SQL insert, a future writer, a
 * tenants.owner_id pointing at a customer -- put it on an advertiser's
 * notifications page AND into their GDPR export, which copies
 * notifications.payload out whole.
 *
 * A second line of defence, at the place it is drawn. An unknown type
 * is allowed through: the catalogue is a list of what we know about,
 * not a list of what exists, and hiding a real notification because it
 * is newer than this file is the worse failure.
 */
export function isCustomerVisibleType(type: string | null | undefined): boolean {
  const entry = NOTIFICATION_CATALOG.find((e) => e.type === type);
  return !entry || entry.audience === "customer";
}

/**
 * The types that must never sit on a customer's record.
 *
 * isCustomerVisibleType answers the same question one row at a time,
 * for rendering. This is the list form, for a query predicate -- the
 * GDPR export and the unread badge both read rows by recipient alone,
 * so a mis-addressed admin notification followed the customer into
 * their download and left a red badge over a list it is not in.
 */
export function adminOnlyNotificationTypes(): string[] {
  return NOTIFICATION_CATALOG.filter((e) => e.audience === "admin").map(
    (e) => e.type,
  );
}
