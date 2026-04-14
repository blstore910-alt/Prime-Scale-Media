"use client";

import AccountsTable from "../account/accounts-table";
import WalletSection from "./wallet-section";

export default function AdvertiserDashboardView() {
  return (
    <div className="flex flex-col-reverse lg:flex-row gap-6 py-4 md:py-6 px-4 lg:px-6 min-h-[calc(100vh-4rem)]">
      <div className="w-full lg:w-8/12">
        <h3 className="font-semibold text-lg">Ad Accounts</h3>
        <AccountsTable />
      </div>

      <div className="w-full lg:w-4/12">
        <WalletSection />
      </div>
    </div>
  );
}
