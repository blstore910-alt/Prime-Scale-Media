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
   * Fee changes waiting on the OWNER. Only the owner can answer one, so
   * an employee admin's dashboard must not show a card they cannot act
   * on -- the dashboard filters it out for them.
   */
  feeChangeRequests: number | null;
  /**
   * Invoices that are unpaid and past their due date.
   *
   * The owner, 28-09, looking at his own home screen: "op homescreen
   * admin/super admin niet echt zien waarbij we past due invoices zien
   * ofzo." He was right -- the Queues block listed DST weeks,
   * affiliates, wallet top-ups, ad-account requests, ad-account
   * top-ups and withdrawals, and nothing at all about money already
   * owed to us. Measured the same day: SIX unpaid invoices on this
   * tenant, every one of them with a due date, every one of them past
   * it.
   *
   * Derived, never asked for as a status: nothing writes
   * `status = 'overdue'` -- see applyInvoiceStatusFilter in
   * lib/invoice-status.ts, which is the same derivation the admin list
   * uses.
   */
  overdueInvoices: number | null;
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

  // isPending, NOT isLoading. `isLoading` is `isPending && isFetching`,
  // so it is FALSE while this query is DISABLED -- and it is disabled
  // until the profile resolves to an admin with a tenant. Every count
  // is null at that moment, so the `isError` line below fired on the
  // very first paint and the money-in card read "Couldn't load the
  // queues" before settling into a number. The comment on that line
  // says `!isLoading` was added to prevent exactly that; it was the
  // wrong flag, so the alarm went on crying wolf on every page load.
  const { data, isError, isPending } = useQuery<{
    walletTopups: number | null;
    bankDeposits: number | null;
    outstandingPrecharges: number | null;
    moneyIn: number | null;
    adAccountWithdrawals: number | null;
    walletRefunds: number | null;
    walletAdjustments: number | null;
    topUps: number | null;
    adAccountRequests: number | null;
    feeChangeRequests: number | null;
    overdueInvoices: number | null;
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
        feeChangeRequests,
        overdueInvoices,
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
        // Fee changes waiting on the owner. The table arrives with plak
        // 111, and code reaches production in minutes while migrations
        // are pasted by hand -- so a missing table must leave every
        // other badge working rather than taking the dashboard with it.
        pendingIn("fee_change_requests"),
        // Unpaid AND past due. Not `.eq("status","overdue")` -- nothing
        // ever writes that value, so it would count zero for ever,
        // which is exactly how this went unnoticed on the export
        // dialog. new Date() on the client: a few seconds of clock skew
        // cannot change whether an invoice is days late.
        supabase
          .from("invoices")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "unpaid")
          .not("due_date", "is", null)
          .lt("due_date", new Date().toISOString()),
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
      const one = (r: { count: number | null; error: unknown }) => {
        if (r.error) return null;
        // ── AND A MISSING HEADER IS NOT A ZERO EITHER ──────────────
        //
        // `count` is parsed out of the content-range HEADER, and
        // postgrest-js leaves it null when that header is absent or
        // unparseable -- with `error` null. So `count ?? 0` turned a
        // header a proxy had stripped into "nobody is waiting", which
        // is exactly what the type docstring at the top of this file
        // forbids: "null means UNKNOWN -- never render it as 0".
        //
        // Three surfaces read these counts (sidebar badge, tab badge,
        // dashboard card) and all three hide a zero, so the queue
        // would look empty on every one of them at once.
        //
        // NaN is worse than null and has to be caught here too: it
        // fails `n <= 0`, so it would have been rendered as the literal
        // text "NaN" on a badge.
        return typeof r.count === "number" && Number.isFinite(r.count)
          ? r.count
          : null;
      };

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

      // 42P01 is "plak 111 is not pasted yet", which is a feature that
      // is not switched on -- not a count we failed to read. Null would
      // print "we don't know" on a card for something that cannot exist
      // yet, so it reads as zero and the card hides itself.
      const feeChanges =
        (feeChangeRequests.error as { code?: string } | null)?.code === "42P01"
          ? 0
          : one(feeChangeRequests);

      return {
        feeChangeRequests: feeChanges,
        overdueInvoices: one(overdueInvoices),
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
    feeChangeRequests: null,
    overdueInvoices: null,
    withdrawals: null,
  };

  return {
    ...counts,
    // NOT while loading. Before the first response every count is null, and
    // treating that as an error meant the dashboard opened with "Couldn't
    // load the queues" on every single page load — an alarm that cried wolf
    // so reliably it would have trained people to ignore the real one.
    isError:
      !isPending &&
      (isError ||
        counts.moneyIn === null ||
        counts.walletTopups === null ||
        counts.topUps === null ||
        counts.adAccountRequests === null ||
        counts.withdrawals === null),
    isLoading: isPending,
  };
}
