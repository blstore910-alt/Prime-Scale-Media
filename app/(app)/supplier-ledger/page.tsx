import SupplierLedger from "@/components/admin/supplier-ledger";
import { requireAdmin } from "@/lib/auth/require-admin";

// Het dagsaldo bij een handmatige leverancier (Bestads). Zie plak 185.
export default async function Page() {
  await requireAdmin("/dashboard");
  return (
    <div className="mx-auto w-full max-w-6xl p-4 md:p-6">
      <SupplierLedger />
    </div>
  );
}
