import PsmVerifyTopups from "@/components/wallet-transactions/psm-verify-topups";
import WiseReviewPanel from "@/components/wise/wise-review-panel";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PsmVerifyTopups defaultStatus="pending" />
      <WiseReviewPanel />
    </div>
  );
}
