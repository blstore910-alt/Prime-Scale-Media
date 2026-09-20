import PsmPromotions from "@/components/promotions/psm-promotions";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  // Use the shared guard: honours the active profile_id cookie, checks
  // is_active/status, and doesn't throw for admins with multiple profiles
  // (the hand-rolled .single() role check did all three wrong).
  // ── A WAIVER IS A PRICE ─────────────────────────────────────────
  // A subscription_waiver makes the billing run skip the charge and
  // roll the date forward, and a 100% subscription_discount does the
  // same thing by another route. So an employee admin refused by
  // upsertPlan, createSubscriptionAsAdmin and changeSubscriptionAmount
  // ("Only the account owner can start, stop or price a subscription")
  // could open Promotions from their own sidebar and stop billing a
  // customer for ever. The page guard and the actions behind it now
  // agree with the other three.
  await requireSuperAdmin();

  return <PsmPromotions />;
}
