"use client";

import { useAppContext } from "@/context/app-provider";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import AccountsTable from "./accounts-table";

// Advertisers live in the single-page app (ad accounts is a view there),
// so route them to /dashboard; admins get the full accounts table.
export default function AccountsRouter() {
  const { profile } = useAppContext();
  const router = useRouter();
  const isAdvertiser = profile?.role === "advertiser";

  useEffect(() => {
    if (isAdvertiser) router.replace("/dashboard");
  }, [isAdvertiser, router]);

  if (isAdvertiser) return null;
  return <AccountsTable />;
}
