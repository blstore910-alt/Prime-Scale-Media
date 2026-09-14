"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type PendingCounts = {
  walletTopups: number;
  topUps: number;
  adAccountRequests: number;
  /** True when a count could not be read. The numbers are then NOT zero,
   *  they are unknown — a caller must not render them as "nothing to do". */
  isError: boolean;
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

  const { data, isError } = useQuery<Omit<PendingCounts, "isError">>({
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
      // A swallowed error here is the worst kind: `count ?? 0` turned an
      // RLS denial or a dropped connection into "nothing is waiting", and
      // the dashboard then told the admin they were all caught up while
      // customers waited on their money. Fail loudly instead.
      const failed = [walletTopups, topUps, adAccountRequests].find(
        (r) => r.error,
      );
      if (failed?.error) throw failed.error;

      return {
        walletTopups: walletTopups.count ?? 0,
        topUps: topUps.count ?? 0,
        adAccountRequests: adAccountRequests.count ?? 0,
      };
    },
  });

  return {
    walletTopups: data?.walletTopups ?? 0,
    topUps: data?.topUps ?? 0,
    adAccountRequests: data?.adAccountRequests ?? 0,
    isError,
  };
}
