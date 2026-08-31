import WithdrawalsTable from "@/components/withdrawals/withdrawals-table";
import PrechargePanel from "@/components/withdrawals/precharge-panel";
import { requireAdmin } from "@/lib/auth/require-admin";

export default async function Page() {
  await requireAdmin("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-10 py-4 md:gap-12 md:py-6 px-4 lg:px-6">
          <WithdrawalsTable />
          <PrechargePanel />
        </div>
      </div>
    </div>
  );
}
