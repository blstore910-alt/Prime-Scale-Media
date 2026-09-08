import PsmRequests from "@/components/ad-account-requests/psm-requests";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");
  return <PsmRequests />;
}
