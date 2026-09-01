"use client";
import { DashboardStatsCards } from "@/components/dashboard-stats-cards";
import RateLimitsView from "@/components/system-status/rate-limits-view";
import SystemStatusPanel from "@/components/system-status/system-status-panel";
import { Button } from "@/components/ui/button";
import { useAppContext } from "@/context/app-provider";
import { UserPlus } from "lucide-react";

export default function AdminDashboard() {
  const { isSuperAdmin, dispatch } = useAppContext();
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <div className="flex items-center justify-between px-4 lg:px-6">
            <h1 className="text-xl font-semibold tracking-tight">Dashboard</h1>
            <Button onClick={() => dispatch("open-invite-user")}>
              <UserPlus className="h-4 w-4" />
              New Invite
            </Button>
          </div>
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
