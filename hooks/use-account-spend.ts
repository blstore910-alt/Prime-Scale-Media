"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { pageAllRows } from "@/lib/page-all-rows";
import { landedOnAccount } from "@/lib/pure-topup-landed";

/**
 * What has been put ON each ad account, and when it last happened.
 *
 * "Spend" in this app means money that reached an ad account — the same
 * measure the affiliate dashboard reports, and the one the desk charges a
 * fee on. It is not a figure read back from Meta or TikTok: nothing here
 * knows what an account actually burned today. So this sums COMPLETED
 * top-ups, and every place that shows it says what it is.
 *
 * ── AMOUNTS: topup_amount IS NOT ALWAYS USD ─────────────────────────
 *
 * This file used to say it was, in as many words, and the Spend column
 * printed a dollar sign over every figure on that basis. Walked on
 * production: AA-PSM0005-EU-01 is a EUR account funded EUR 97 + EUR 97
 * with EUR 50 taken back, and the column read "$144.00".
 *
 * `topup_amount` carries the PAYMENT currency on the customer's RPC path
 * and dollars on the admin paths; `topup_usd` is the discriminator, and
 * lib/pure-topup-landed.ts is the one place that knows it. So the sum is
 * kept PER CURRENCY and never added across them — adding those together
 * would be inventing a number, which is the one thing the old comment
 * got right.
 *
 * `lastAt` drives the 30-day inactive rule in lib/ad-account-status.ts, so
 * it only counts completed top-ups too: a pending one is not activity, it
 * is a claim somebody still has to verify.
 */
export type AccountSpend = {
  /** What landed, per currency. Never summed across them. */
  byCurrency: Record<string, number>;
  count: number;
  lastAt: string | null;
};

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
          // topup_usd and currency are the discriminator pair. Without
          // them every row reads as an admin row, i.e. as dollars.
          .select(
            "account_id, topup_amount, topup_usd, currency, status, created_at",
          )
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
        // ── PAGED, LIKE THE TOP-UPS HALF FORTY LINES ABOVE ──────────
        //
        // This was a bare select against the 1,000-row ceiling, sitting
        // next to a read that is carefully paged with its own comment
        // about that exact cap. Withdrawals are SUBTRACTED here, so past
        // a thousand approved withdrawals tenant-wide the subtraction is
        // short and every account's Spend figure is too HIGH -- which is
        // the direction actions/withdrawal-actions.ts names out loud as
        // the one that fails open. The server guard pages this same
        // table correctly; the screen the admin reads before approving
        // did not.
        const wPaged = await pageAllRows<{
          ad_account_id?: unknown;
          amount?: unknown;
          status?: unknown;
        }>((from, to) =>
          supabase
            .from("ad_account_withdrawals")
            // The currency too: since plak 22 a withdrawal carries the
            // currency of its ad account, so it comes off the right leg.
            .select("ad_account_id, amount, currency, status")
            .eq("tenant_id", tenantId)
            .eq("status", "approved")
            .order("id", { ascending: true })
            .range(from, to),
        );
        // A withdrawals table we cannot read must not quietly become
        // zero withdrawals — that is the direction that overstates the
        // balance, which is the direction that costs money. Same for a
        // truncated one: a floor presented as a total is the same lie.
        if (wPaged.error) throw new Error(wPaged.error);
        if (wPaged.truncated) {
          throw new Error(
            "There are more approved withdrawals than this screen can add up, so the spend figures would be too high. Narrow the view or ask for a report.",
          );
        }
        const wds = wPaged.rows;
        for (const w of wds ?? []) {
          const id = String(
            (w as { ad_account_id?: unknown }).ad_account_id ?? "",
          );
          if (!id) continue;
          const cur = String(
            (w as { currency?: unknown }).currency ?? "USD",
          ).toUpperCase();
          const key = `${id}|${cur}`;
          withdrawn[key] =
            (withdrawn[key] ?? 0) +
            (Number((w as { amount?: unknown }).amount) || 0);
        }
      }

      const out: Record<string, AccountSpend> = {};
      for (const row of rows) {
        const r = row as {
          account_id: string | null;
          created_at: string | null;
        };
        if (!r.account_id) continue;
        const acc = (out[r.account_id] ??= {
          byCurrency: {},
          count: 0,
          lastAt: null,
        });
        const landed = landedOnAccount(
          row as Parameters<typeof landedOnAccount>[0],
        );
        if (landed.amount !== null) {
          acc.byCurrency[landed.currency] =
            Math.round(
              ((acc.byCurrency[landed.currency] ?? 0) + landed.amount) * 100,
            ) / 100;
        }
        acc.count += 1;
        if (r.created_at && (!acc.lastAt || r.created_at > acc.lastAt)) {
          acc.lastAt = r.created_at;
        }
      }
      // Every withdrawal comes off its own currency leg, including one
      // against an account with no completed top-up — that is a negative
      // figure, and a negative figure is the truth worth showing.
      for (const [key, amount] of Object.entries(withdrawn)) {
        const [id, cur] = key.split("|");
        const acc = (out[id] ??= { byCurrency: {}, count: 0, lastAt: null });
        acc.byCurrency[cur] =
          Math.round(((acc.byCurrency[cur] ?? 0) - amount) * 100) / 100;
      }
      return out;
    },
  });

  return { byAccount: data ?? {}, isError, isLoading };
}
