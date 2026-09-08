import PsmVerifyAdTopups from "@/components/topups/psm-verify-ad-topups";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");
  return <PsmVerifyAdTopups />;
}
