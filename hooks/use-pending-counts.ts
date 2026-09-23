"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type PendingCounts = {
  /**
   * null means UNKNOWN — the count could not be read. Never render it as 0.
   *
   * WALLET TOP-UPS, AND ONLY THOSE. This used to sum all three queues on
   * /wallet-topups so no work could hide behind a 0 — but the card is
   * labelled "Wallet topups to verify", and the owner opened a dashboard
   * reading 5 on a tenant with ZERO pending top-ups: the 5 were bank
   * deposits. A number under a label has to be that label's number.
   * Bank deposits and outstanding advances get their own, below; the
   * SIDEBAR keeps the sum, because a badge on a nav item means "work
   * behind this link".
   */
  walletTopups: number | null;
  /** Deposits in the bank nobody has claimed yet. */
  bankDeposits: number | null;
  /** Wallet credit advanced before a payment cleared, still outstanding. */
  outstandingPrecharges: number | null;
  /** All three of the above — what the /wallet-topups link is worth. */
  moneyIn: number | null;
  /** The three tables behind /withdrawals, per tab, so each can label
      its own. null for any that could not be read. */
  adAccountWithdrawals: number | null;
  walletRefunds: number | null;
  walletAdjustments: number | null;
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
    bankDeposits: number | null;
    outstandingPrecharges: number | null;
    moneyIn: number | null;
    adAccountWithdrawals: number | null;
    walletRefunds: number | null;
    walletAdjustments: number | null;
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
        bankDeposits,
        outstandingPrecharges,
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
          .eq("status", "pending")
          // A deleted top-up is not waiting on anybody. This badge is
          // how an admin decides whether the queue needs working.
          .not("is_deleted", "is", true),
        supabase
          .from("ad_account_requests")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          // A claimed request ("I'm on it") and one waiting on its invoice
          // are still open work -- the review dialog keeps Create Ad
          // Account live for both -- but counting only `pending` dropped
          // them off every badge the moment an admin touched them.
          .in("status", ["pending", "payment_pending", "in_progress"]),
        // The three tables behind the single /withdrawals screen.
        pendingIn("ad_account_withdrawals"),
        pendingIn("wallet_refunds"),
        pendingIn("wallet_adjustments"),
        // The other two queues on /wallet-topups. `.or` with the null
        // arm like the panel and the tab badge: that column is nullable
        // on purpose for a deposit nobody could attribute, and those
        // are exactly the ones that need working.
        supabase
          .from("wise_incoming_transfers")
          .select("id", { count: "exact", head: true })
          .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
          // Anything not yet dealt with needs a person. Counting only
          // `suggested` counted 277 unmatched deposits as zero -- over a
          // third of a million euro of bank money, under a badge reading 0.
          // A status we have not thought of yet lands on the badge instead
          // of falling through it.
          .not("status", "in", "(confirmed,completed,matched)")
          .is("archived_at", null),
        supabase
          .from("wallet_precharges")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "outstanding"),
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

      // The /wallet-topups card points at a screen with THREE queues --
      // wallet top-ups, bank deposits waiting to be confirmed, and
      // outstanding precharges -- and it metered one. A "0" was read as
      // "nothing at that address" while suggested deposits sat there.
      // Same shape as the Withdrawals card, which already sums its own
      // three: one unreadable table makes the figure unknown rather
      // than short.
      const moneyInParts = [
        walletTopups,
        bankDeposits,
        outstandingPrecharges,
      ].map(one);
      const moneyIn = moneyInParts.some((p) => p === null)
        ? null
        : moneyInParts.reduce((a: number, b) => a + (b as number), 0);

      return {
        walletTopups: one(walletTopups),
        bankDeposits: one(bankDeposits),
        outstandingPrecharges: one(outstandingPrecharges),
        moneyIn,
        topUps: one(topUps),
        adAccountRequests: one(adAccountRequests),
        withdrawals,
        // Per tab, so /withdrawals can label its own three.
        adAccountWithdrawals: one(adAccountWithdrawals),
        walletRefunds: one(walletRefunds),
        walletAdjustments: one(walletAdjustments),
      };
    },
  });

  const counts = data ?? {
    walletTopups: null,
    bankDeposits: null,
    outstandingPrecharges: null,
    moneyIn: null,
    adAccountWithdrawals: null,
    walletRefunds: null,
    walletAdjustments: null,
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
        counts.moneyIn === null ||
        counts.walletTopups === null ||
        counts.topUps === null ||
        counts.adAccountRequests === null ||
        counts.withdrawals === null),
    isLoading,
  };
}
