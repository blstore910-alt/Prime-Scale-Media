"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * What has been put ON each ad account, and when it last happened.
 *
 * "Spend" in this app means money that reached an ad account — the same
 * measure the affiliate dashboard reports, and the one the desk charges a
 * fee on. It is not a figure read back from Meta or TikTok: nothing here
 * knows what an account actually burned today. So this sums COMPLETED
 * top-ups, and every place that shows it says what it is.
 *
 * Amounts: top_ups.topup_amount is the USD amount credited to the account
 * (topup_usd / amount_usd are the same money at different points in the
 * flow). Currency on the row is the currency the customer PAID in, not the
 * amount's unit — adding those together would be inventing a number.
 *
 * `lastAt` drives the 30-day inactive rule in lib/ad-account-status.ts, so
 * it only counts completed top-ups too: a pending one is not activity, it
 * is a claim somebody still has to verify.
 */
export type AccountSpend = { usd: number; count: number; lastAt: string | null };

export function useAccountSpend(tenantId: string | null | undefined): {
  byAccount: Record<string, AccountSpend>;
  isError: boolean;
  isLoading: boolean;
} {
  const { data, isError, isLoading } = useQuery<Record<string, AccountSpend>>({
    queryKey: ["account-spend", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("top_ups")
        .select("account_id, topup_amount, status, created_at")
        .eq("tenant_id", tenantId)
        .eq("status", "completed");
      if (error) throw error;

      const out: Record<string, AccountSpend> = {};
      for (const row of data ?? []) {
        const r = row as {
          account_id: string | null;
          topup_amount: number | string | null;
          created_at: string | null;
        };
        if (!r.account_id) continue;
        const acc = (out[r.account_id] ??= { usd: 0, count: 0, lastAt: null });
        acc.usd += Number(r.topup_amount) || 0;
        acc.count += 1;
        if (r.created_at && (!acc.lastAt || r.created_at > acc.lastAt)) {
          acc.lastAt = r.created_at;
        }
      }
      return out;
    },
  });

  return { byAccount: data ?? {}, isError, isLoading };
}
