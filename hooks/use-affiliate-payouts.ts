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

export function useAffiliatePayouts(enabled: boolean) {
  const q = useQuery<PayoutsState>({
    queryKey: ["affiliate-payouts"],
    enabled,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("affiliate_payouts")
        .select(
          "id, tenant_id, affiliate_advertiser_id, currency, amount, commission_count, clawback_amount, status, method, details, reason, reference, requested_at, decided_at, paid_at",
        )
        .order("requested_at", { ascending: false })
        .limit(50);
      if (error) {
        if (MISSING.test(error.message)) return { rows: [], missing: true };
        throw error;
      }
      return { rows: (data ?? []) as AffiliatePayout[], missing: false };
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
