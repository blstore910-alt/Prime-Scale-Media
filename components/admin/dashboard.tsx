"use client";
import { DashboardStatsCards } from "@/components/dashboard-stats-cards";

export default function AdminDashboard() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <DashboardStatsCards />
        </div>
      </div>
    </div>
  );
}
