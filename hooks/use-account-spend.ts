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

      // PAGED. This was one unbounded select, and PostgREST caps a response
      // at 1000 rows by default — so past that the Spend column silently
      // understated every account, and `lastAt` (which drives the derived
      // "Inactive — no top-up in the last 30 days" badge) could miss a
      // top-up from yesterday because its row fell outside the slice. This
      // project already lives above those caps: the Wise panel's own
      // comment records 229 rows where 100 had been assumed.
      //
      // Ordered oldest-first so the pages are stable while we walk them,
      // and capped at 20 pages — 20,000 top-ups — with the cap logged
      // rather than silently swallowed.
      const PAGE = 1000;
      const MAX_PAGES = 20;
      const rows: Array<Record<string, unknown>> = [];
      for (let page = 0; page < MAX_PAGES; page += 1) {
        const from = page * PAGE;
        const { data, error } = await supabase
          .from("top_ups")
          .select("account_id, topup_amount, status, created_at")
          .eq("tenant_id", tenantId)
          .eq("status", "completed")
          // A deleted top-up is not spend. This feeds the Spend column on
          // /accounts AND lastAt, which is what decides the derived
          // "Inactive - no top-up in 30 days" badge.
          .not("is_deleted", "is", true)
          .order("created_at", { ascending: true })
          .range(from, from + PAGE - 1);
        if (error) throw error;
        rows.push(...((data ?? []) as Array<Record<string, unknown>>));
        if ((data ?? []).length < PAGE) break;
        if (page === MAX_PAGES - 1) {
          console.warn(
            `use-account-spend: stopped at ${MAX_PAGES * PAGE} top-ups; the Spend column is understated`,
          );
        }
      }

      const out: Record<string, AccountSpend> = {};
      for (const row of rows) {
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
