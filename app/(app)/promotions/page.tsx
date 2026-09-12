import PsmPromotions from "@/components/promotions/psm-promotions";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  // Use the shared guard: honours the active profile_id cookie, checks
  // is_active/status, and doesn't throw for admins with multiple profiles
  // (the hand-rolled .single() role check did all three wrong).
  await requireAdmin();

  return <PsmPromotions />;
}
