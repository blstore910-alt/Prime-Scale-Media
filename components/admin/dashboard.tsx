"use client";
import { DashboardStatsCards } from "@/components/dashboard-stats-cards";
import RateLimitsView from "@/components/system-status/rate-limits-view";
import SystemStatusPanel from "@/components/system-status/system-status-panel";
import { useAppContext } from "@/context/app-provider";

export default function AdminDashboard() {
  const { isSuperAdmin } = useAppContext();
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          {isSuperAdmin && (
            <>
              <div className="px-4 lg:px-6">
                <SystemStatusPanel />
              </div>
              <div className="px-4 lg:px-6">
                <RateLimitsView />
              </div>
            </>
          )}
          <DashboardStatsCards />
        </div>
      </div>
    </div>
  );
}
