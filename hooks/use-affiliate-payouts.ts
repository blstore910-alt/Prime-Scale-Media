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
  /** Requests made together (plak 51); absent before it. */
  group_id?: string | null;
  /** What the affiliate receives it in. */
  payout_currency?: string | null;
  /** EUR per 1 USD, when we converted. */
  fx_rate?: number | string | null;
  fx_fee_pct?: number | string | null;
  fx_fee_amount?: number | string | null;
  /** What they receive after conversion and fee. */
  payout_amount?: number | string | null;
  /** Payout #1, #2, #3 per tenant (plak 52); absent before it. */
  payout_no?: number | null;
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

const BASE_COLUMNS =
  "id, tenant_id, affiliate_advertiser_id, currency, amount, commission_count, clawback_amount, status, method, details, reason, reference, requested_at, decided_at, paid_at";
// Plak 51. Asked for first and dropped on 42703, so the screen works
// before that migration lands instead of breaking on it.
const COLUMNS_51 =
  BASE_COLUMNS +
  ", group_id, payout_currency, fx_rate, fx_fee_pct, fx_fee_amount, payout_amount";
const COLUMNS_52 = COLUMNS_51 + ", payout_no";
// Newest first, then older, then the plain table: each plak adds columns
// and they are pasted by hand, so the screen must work at every step.
const COLUMN_SETS = [COLUMNS_52, COLUMNS_51, BASE_COLUMNS];
const MISSING_COLUMN = /42703|column .* does not exist/i;

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
      const read = (cols: string, open: boolean) =>
        open
          ? supabase
              .from("affiliate_payouts")
              .select(cols)
              .eq("status", "requested")
              .order("requested_at", { ascending: false })
          : supabase
              .from("affiliate_payouts")
              .select(cols)
              .neq("status", "requested")
              .order("requested_at", { ascending: false })
              .limit(50);

      let cols = COLUMN_SETS[0];
      let waiting = await read(cols, true);
      for (let i = 1; i < COLUMN_SETS.length; i += 1) {
        if (!waiting.error || !MISSING_COLUMN.test(waiting.error.message)) break;
        cols = COLUMN_SETS[i];
        waiting = await read(cols, true);
      }
      if (waiting.error) {
        if (MISSING.test(waiting.error.message)) return { rows: [], missing: true };
        throw waiting.error;
      }
      const settled = await read(cols, false);
      if (settled.error) throw settled.error;
      return {
        rows: [
          ...((waiting.data ?? []) as unknown as AffiliatePayout[]),
          ...((settled.data ?? []) as unknown as AffiliatePayout[]),
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
