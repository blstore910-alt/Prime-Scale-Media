"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type PendingCounts = {
  walletTopups: number;
  topUps: number;
  adAccountRequests: number;
};

/**
 * Cheap read-only aggregation for the admin sidebar badges.
 * Refreshes every 60 seconds; a full refetch after mutation
 * happens automatically via the react-query invalidation the
 * server actions already trigger.
 */
export function usePendingCounts(): PendingCounts {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;

  const { data } = useQuery<PendingCounts>({
    queryKey: ["pending-counts", tenantId],
    enabled: !!tenantId && profile?.role === "admin",
    refetchInterval: 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const [walletTopups, topUps, adAccountRequests] = await Promise.all([
        supabase
          .from("wallet_topups")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending"),
        supabase
          .from("top_ups")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending"),
        supabase
          .from("ad_account_requests")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending"),
      ]);
      return {
        walletTopups: walletTopups.count ?? 0,
        topUps: topUps.count ?? 0,
        adAccountRequests: adAccountRequests.count ?? 0,
      };
    },
  });

  return (
    data ?? {
      walletTopups: 0,
      topUps: 0,
      adAccountRequests: 0,
    }
  );
}
