import LedgerScreen from "@/components/ledger/ledger-screen";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  // Owner only. This is every movement of every customer's money on
  // one page; it sits beside /reconciliation for the same reason.
  await requireSuperAdmin("/dashboard");

  return <LedgerScreen />;
}
