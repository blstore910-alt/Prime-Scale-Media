"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type PendingCounts = {
  /** null means UNKNOWN — the count could not be read. Never render it as 0. */
  walletTopups: number | null;
  topUps: number | null;
  adAccountRequests: number | null;
  /**
   * Pending across all three tables the /withdrawals page shows: ad-account
   * withdrawals, wallet refunds and wallet adjustments. They share one screen
   * and one queue card, so they share one count. null if ANY of the three
   * could not be read — a partial sum of a money-out queue is worse than
   * saying we don't know.
   */
  withdrawals: number | null;
  /** True when at least one count could not be read. Never true while the
   *  first request is still in flight — unknown-yet is not unknown. */
  isError: boolean;
  isLoading: boolean;
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

  const { data, isError, isLoading } = useQuery<{
    walletTopups: number | null;
    topUps: number | null;
    adAccountRequests: number | null;
    withdrawals: number | null;
  }>({
    queryKey: ["pending-counts", tenantId],
    enabled: !!tenantId && profile?.role === "admin",
    refetchInterval: 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const pendingIn = (table: string) =>
        supabase
          .from(table)
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending");

      const [
        walletTopups,
        topUps,
        adAccountRequests,
        adAccountWithdrawals,
        walletRefunds,
        walletAdjustments,
      ] = await Promise.all([
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
        // The three tables behind the single /withdrawals screen.
        pendingIn("ad_account_withdrawals"),
        pendingIn("wallet_refunds"),
        pendingIn("wallet_adjustments"),
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

      // One unreadable table makes the whole withdrawals figure unknown.
      // Showing "2" when a third table was denied means an admin reads a
      // complete queue off an incomplete answer, and somebody's payout sits
      // there unseen.
      const parts = [adAccountWithdrawals, walletRefunds, walletAdjustments].map(one);
      const withdrawals = parts.some((p) => p === null)
        ? null
        : parts.reduce((a: number, b) => a + (b as number), 0);

      return {
        walletTopups: one(walletTopups),
        topUps: one(topUps),
        adAccountRequests: one(adAccountRequests),
        withdrawals,
      };
    },
  });

  const counts = data ?? {
    walletTopups: null,
    topUps: null,
    adAccountRequests: null,
    withdrawals: null,
  };

  return {
    ...counts,
    // NOT while loading. Before the first response every count is null, and
    // treating that as an error meant the dashboard opened with "Couldn't
    // load the queues" on every single page load — an alarm that cried wolf
    // so reliably it would have trained people to ignore the real one.
    isError:
      !isLoading &&
      (isError ||
        counts.walletTopups === null ||
        counts.topUps === null ||
        counts.adAccountRequests === null ||
        counts.withdrawals === null),
    isLoading,
  };
}
