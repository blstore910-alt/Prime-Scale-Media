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

      // ── AND WHAT CAME BACK OUT ────────────────────────────────────
      //
      // This summed completed top-ups and stopped. So the one figure an
      // admin has when approving a withdrawal — and the approve screen
      // shows no balance of its own — never moved when a withdrawal was
      // approved. Fund 500, withdraw 500, approve: the column still
      // reads 500. Ask for 500 again and nothing anywhere contradicts
      // it, because ad_account_withdrawal_approve does no balance check
      // either and says so in its own comment.
      //
      // Approved only. A pending request has not moved anything yet, and
      // showing it as gone would block a withdrawal that is still just a
      // request.
      const withdrawn: Record<string, number> = {};
      {
        const { data: wds, error: wErr } = await supabase
          .from("ad_account_withdrawals")
          .select("ad_account_id, amount, status")
          .eq("tenant_id", tenantId)
          .eq("status", "approved");
        // A withdrawals table we cannot read must not quietly become
        // zero withdrawals — that is the direction that overstates the
        // balance, which is the direction that costs money.
        if (wErr) throw wErr;
        for (const w of wds ?? []) {
          const id = String(
            (w as { ad_account_id?: unknown }).ad_account_id ?? "",
          );
          if (!id) continue;
          withdrawn[id] =
            (withdrawn[id] ?? 0) +
            (Number((w as { amount?: unknown }).amount) || 0);
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
      // Every withdrawal comes off, including one against an account
      // with no completed top-up — that is a negative figure, and a
      // negative figure is the truth worth showing.
      for (const [id, amount] of Object.entries(withdrawn)) {
        const acc = (out[id] ??= { usd: 0, count: 0, lastAt: null });
        acc.usd -= amount;
      }
      return out;
    },
  });

  return { byAccount: data ?? {}, isError, isLoading };
}
