import PsmWallets from "@/components/wallets/psm-wallets";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");
  return <PsmWallets />;
}
