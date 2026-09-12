import PsmSubscriptions from "@/components/subscriptions/psm-subscriptions";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");
  return <PsmSubscriptions />;
}
