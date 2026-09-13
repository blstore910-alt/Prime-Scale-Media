import PsmAccountPool from "@/components/account-pool/psm-account-pool";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");
  return <PsmAccountPool />;
}
