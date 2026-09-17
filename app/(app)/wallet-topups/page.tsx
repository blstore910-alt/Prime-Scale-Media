import PsmVerifyTopups from "@/components/wallet-transactions/psm-verify-topups";
import WiseReviewPanel from "@/components/wise/wise-review-panel";
import PrechargePanel from "@/components/withdrawals/precharge-panel";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 24 }}>
      <PsmVerifyTopups defaultStatus="pending" />
      <WiseReviewPanel />
      {/* Precharge belongs here, not on /withdrawals. It advances wallet
          credit against a payment that has NOT cleared, and it settles when
          that payment is verified — so the admin doing it is already looking
          at this queue. Withdrawals is money leaving the system; this is
          money arriving early. */}
      <PrechargePanel />
    </div>
  );
}
