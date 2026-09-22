"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

// ── THE PAYOUTS THIS SESSION MAY SEE ────────────────────────────────────
//
// RLS decides: an affiliate sees their own, an admin sees the tenant's.
// So one hook serves both the portal and the owner's queue.
//
// A table plak 50 has not created yet is "not switched on" — the button
// stays away, the screen does not break, and it is NEVER reported as
// "no payouts" (that is a statement about money).

const MISSING = /42P01|does not exist|schema cache|PGRST20\d/i;

export type AffiliatePayout = {
  id: string;
  tenant_id: string;
  affiliate_advertiser_id: string;
  currency: string;
  amount: number;
  commission_count: number;
  clawback_amount: number;
  status: "requested" | "paid" | "rejected" | "cancelled";
  method: string;
  details: Record<string, string> | null;
  reason: string | null;
  reference: string | null;
  requested_at: string;
  decided_at: string | null;
  paid_at: string | null;
};

export type PayoutsState = {
  rows: AffiliatePayout[];
  /** Plak 50 is not in yet. */
  missing: boolean;
};

const COLUMNS =
  "id, tenant_id, affiliate_advertiser_id, currency, amount, commission_count, clawback_amount, status, method, details, reason, reference, requested_at, decided_at, paid_at";

/**
 * @param scope who is asking — a tenant id for the owner's queue, an
 *   advertiser id for one affiliate. It is part of the cache key: the same
 *   hook serves both, and without it a profile switch inside the cache
 *   window could paint one identity's payouts as the other's.
 */
export function useAffiliatePayouts(enabled: boolean, scope?: string | null) {
  const q = useQuery<PayoutsState>({
    queryKey: ["affiliate-payouts", scope ?? ""],
    enabled,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient();
      // TWO READS, because a single `limit` would cut the queue off: with
      // fifty settled payouts in front of it, a request that is genuinely
      // waiting would simply not be in the owner's list -- no count, no
      // notice. Everything still waiting, plus the recent history.
      const waiting = await supabase
        .from("affiliate_payouts")
        .select(COLUMNS)
        .eq("status", "requested")
        .order("requested_at", { ascending: false });
      if (waiting.error) {
        if (MISSING.test(waiting.error.message)) return { rows: [], missing: true };
        throw waiting.error;
      }
      const settled = await supabase
        .from("affiliate_payouts")
        .select(COLUMNS)
        .neq("status", "requested")
        .order("requested_at", { ascending: false })
        .limit(50);
      if (settled.error) throw settled.error;
      return {
        rows: [
          ...((waiting.data ?? []) as AffiliatePayout[]),
          ...((settled.data ?? []) as AffiliatePayout[]),
        ],
        missing: false,
      };
    },
  });

  return {
    rows: q.data?.rows ?? [],
    missing: !!q.data?.missing,
    /** No answer yet — including a query that is switched off. */
    isPending: q.isPending,
    isError: q.isError,
    refetch: q.refetch,
  };
}

export default useAffiliatePayouts;
