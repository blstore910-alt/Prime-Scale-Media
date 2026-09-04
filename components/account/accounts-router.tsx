"use client";

import { useAppContext } from "@/context/app-provider";
import AccountsTable from "./accounts-table";
import PsmAccountsView from "./psm-accounts-view";

// Advertisers get the ported mockup grid inside the PSM shell; admins
// keep the full accounts table (edit / manage / assign) as-is.
export default function AccountsRouter() {
  const { profile } = useAppContext();
  if (profile?.role === "advertiser") return <PsmAccountsView />;
  return <AccountsTable />;
}
