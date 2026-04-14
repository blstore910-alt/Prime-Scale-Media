import AdvertiserDashboardView from "./dashboard-view";

export default function AdvertiserDashboard() {
  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <AdvertiserDashboardView />
      </div>
    </div>
  );
}
