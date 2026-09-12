import ReconciliationView from "@/components/reconciliation/reconciliation-view";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  // Reconciliation is super-admin only (owner reviews the books). A plain
  // admin — whose role is also "admin" — must not reach it by URL.
  await requireSuperAdmin("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2 py-4">
        <ReconciliationView />
      </div>
    </div>
  );
}
