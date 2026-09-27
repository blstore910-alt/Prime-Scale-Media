"use client";

import { useQuery } from "@tanstack/react-query";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";

// ── WHAT WE PAY, ON AN ACCOUNT THAT ALREADY EXISTS ───────────────────
//
// The owner, 27-09: "supplier fee moet ook admin kunnen zien niet
// changen."
//
// The create form has always had the field. Nothing else did. The value
// goes into public.ad_account_costs at creation and after that no screen
// in the app reads it back -- `getAdAccountCosts` in
// actions/ad-account-actions.ts has NO callers, so it was written, kept
// and never shown. An admin looking at an existing account cannot see
// what we pay on it, which is the one figure that tells them whether a
// fee change would sell at a loss.
//
// So: read it here. Admin-only by RLS (`ad_account_costs_admin_read` ->
// `_is_admin_of(tenant_id)`), and this hook must never be called from a
// customer-facing screen -- the supplier's price is not the customer's
// business, in the UI or in the JSON behind it.
//
// SEEING IT IS NOT CHANGING IT. The input stays disabled for anyone who
// is not the tenant owner, and `upsertSupplierFee` refuses a non-owner
// server-side, which is where the boundary actually is.

export type AdAccountCost = {
  /** What we pay the supplier on this account, as a percent. */
  supplierFeePct: number | null;
  /** False when the read failed -- so a caller can avoid printing a
   *  confident "not set" over an error. A cost we could not read is not
   *  a cost of zero. */
  read: boolean;
};

export function useAdAccountCost(adAccountId: string | null | undefined) {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id;

  const q = useQuery<AdAccountCost>({
    queryKey: ["ad-account-cost", tenantId, adAccountId ?? ""],
    enabled: !!tenantId && !!adAccountId,
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("ad_account_costs")
        .select("supplier_fee_pct")
        .eq("tenant_id", tenantId)
        .eq("ad_account_id", adAccountId)
        .maybeSingle();
      // RLS returns ZERO ROWS rather than raising, so "no row" here means
      // either no cost recorded or no permission -- both read as "we do
      // not know", which is what null says. A real error still throws.
      if (error) throw error;
      const raw = (data as { supplier_fee_pct?: unknown } | null)
        ?.supplier_fee_pct;
      // numeric arrives as a STRING over PostgREST.
      const n = raw == null ? null : Number(raw);
      return {
        supplierFeePct: n != null && Number.isFinite(n) ? n : null,
        read: true,
      };
    },
  });

  return {
    supplierFeePct: q.data?.supplierFeePct ?? null,
    /** True while we genuinely do not know yet. isPending, not isLoading:
     *  isLoading is false for a disabled query, which would read as
     *  "loaded, and the answer is none". */
    isPending: q.isPending,
    isError: q.isError,
  };
}
