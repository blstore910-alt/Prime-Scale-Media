import ActivityLogsTable from "@/components/activity-logs/activity-logs-table";
import { requireSuperAdmin } from "@/lib/auth/require-super-admin";

export default async function Page() {
  await requireSuperAdmin("/dashboard");

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <ActivityLogsTable />
        </div>
      </div>
    </div>
  );
}
