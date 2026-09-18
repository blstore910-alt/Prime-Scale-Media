import MoneyInTabs from "@/components/wallet-transactions/money-in-tabs";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");

  // Three stacked panels became three tabs — see money-in-tabs.tsx for why
  // that is safe now and was not before.
  return <MoneyInTabs />;
}
