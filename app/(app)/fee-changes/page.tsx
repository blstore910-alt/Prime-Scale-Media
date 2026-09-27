import FeeChangeQueue from "@/components/fee-changes/fee-change-queue";
import { requireAdmin } from "@/lib/auth/require-admin";

// requireAdmin, not requireSuperAdmin: an employee admin who ASKED for a
// change should be able to see what happened to it. Deciding is still
// owner-only, enforced in `fee_change_decide` itself and mirrored by the
// disabled buttons — a page guard is not the boundary for a money write.
export default async function Page() {
  await requireAdmin("/dashboard");
  return <FeeChangeQueue />;
}
