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
