import PsmAdvertisers from "@/components/admin/users/psm-advertisers";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");

  return <PsmAdvertisers />;
}
