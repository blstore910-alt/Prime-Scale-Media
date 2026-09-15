"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type PendingCounts = {
  /** null means UNKNOWN — the count could not be read. Never render it as 0. */
  walletTopups: number | null;
  topUps: number | null;
  adAccountRequests: number | null;
  /** True when at least one count could not be read. */
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

  const { data, isError } = useQuery<{
    walletTopups: number | null;
    topUps: number | null;
    adAccountRequests: number | null;
  }>({
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
      // customers waited on their money.
      //
      // But throwing on the FIRST failure was the other half of the same
      // mistake: it discarded the two counts that did come back, so one
      // unreadable table made all three unknown. Each count now reports its
      // own truth — a number, or null for "not read".
      const one = (r: { count: number | null; error: unknown }) =>
        r.error ? null : r.count ?? 0;

      return {
        walletTopups: one(walletTopups),
        topUps: one(topUps),
        adAccountRequests: one(adAccountRequests),
      };
    },
  });

  const counts = data ?? {
    walletTopups: null,
    topUps: null,
    adAccountRequests: null,
  };

  return {
    ...counts,
    isError:
      isError ||
      counts.walletTopups === null ||
      counts.topUps === null ||
      counts.adAccountRequests === null,
  };
}
