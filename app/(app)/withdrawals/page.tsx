import PsmWithdrawals from "@/components/withdrawals/psm-withdrawals";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");
  return <PsmWithdrawals />;
}
