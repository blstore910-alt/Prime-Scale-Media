"use client";

import { createClient } from "@/lib/supabase/client";
import { pageAllRows } from "@/lib/page-all-rows";
import { useQuery } from "@tanstack/react-query";

/**
 * What each affiliate has earned, keyed by their EMAIL.
 *
 * Keyed by email on purpose. `referral_links_with_details` identifies the
 * affiliate side as `affiliate_advertiser_*` — it models an advertiser
 * acting as an affiliate — while the admin user list is a list of
 * `user_profiles`, which includes standalone affiliates that have no
 * advertisers row at all. Email is the one identifier both sides carry, and
 * it is what the desk uses to talk about a person anyway.
 *
 * Summed per currency and never added together: that would mean picking a
 * rate and presenting the result as fact.
 *
 * Returns an empty map on failure so a caller renders no figure rather than
 * a zero — an affiliate who has earned money must never be shown 0.00
 * because a read failed.
 */
export type AffiliateEarnings = { eur: number; usd: number; links: number };

export function useAffiliateEarnings(
  tenantId: string | null | undefined,
): {
  byEmail: Record<string, AffiliateEarnings>;
  isError: boolean;
  isLoading: boolean;
} {
  // ── isLoading TOO ─────────────────────────────────────────────────
  //
  // The return type had no loading flag, so the caller fell back to
  // {eur:0, usd:0} and rendered "EUR 0.00 / $0.00" for the first second
  // of every load -- to an affiliate who is owed EUR 4,380, in the
  // column an admin pays from. The docblock at the top of this file
  // states the rule it made impossible: "an affiliate who has earned
  // money must never be shown 0.00 because a read failed."
  const { data, isError, isLoading } = useQuery<
    Record<string, AffiliateEarnings>
  >({
    queryKey: ["affiliate-earnings-by-email", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      // NOT `status` from the view. The details view is hand-authored and on
      // this database does not expose the status column that was later added
      // to referral_links — selecting it fails the whole query with "column
      // referral_links_with_details.status does not exist", which is exactly
      // what happened the first time this shipped. components/affiliate/
      // affiliate-table.tsx already carried the same note; the status comes
      // from the base table and is merged in.
      // ── PAGED, AND ORDERED ──────────────────────────────────────
      //
      // PostgREST caps a response at 1000 rows and says nothing about it.
      // This is the only source of the Earnings column on the admin
      // Affiliates tab — the column somebody pays from — so on a tenant
      // with more links than that, an affiliate whose links sort past the
      // cut read EUR 0.00 / USD 0.00 with no error and no notice. There
      // was no .order() either, so WHICH thousand came back was
      // unspecified and the same affiliate's figure moved between
      // refreshes with no data changing. lib/page-all-rows.ts exists for
      // exactly this and names two earlier incidents.
      const paged = await pageAllRows<Record<string, unknown>>((from, to) =>
        supabase
          .from("referral_links_with_details")
          .select("id, affiliate_advertiser_email, earnings_eur, earnings_usd")
          .eq("tenant_id", tenantId)
          .order("id", { ascending: true })
          .range(from, to),
      );
      if (paged.error) throw new Error(paged.error);
      const data = paged.rows;

      const ids = (data ?? [])
        .map((r) => (r as { id?: string }).id)
        .filter((v): v is string => !!v);
      const statusById = new Map<string, string>();
      if (ids.length > 0) {
        // Best effort: if referral_links has no status column either, every
        // link counts, which is the same answer as before statuses existed.
        const { data: statusRows, error: statusError } = await supabase
          .from("referral_links")
          .select("id, status")
          .in("id", ids);
        // ── A MISSING COLUMN IS BEST-EFFORT; A FAILED READ IS NOT ───
        //
        // The comment above is right that an absent `status` column
        // should fall back to counting every link. But EVERY error was
        // swallowed, so a refused read left statusById empty and the
        // rejected-link filter below matched nothing -- rejected
        // commissions added straight into an affiliate's Earnings
        // figure, which is money they are not owed. 42703 is "column
        // does not exist"; anything else is thrown so the screen shows
        // a dash instead of a wrong total.
        if (
          statusError &&
          (statusError as { code?: string }).code !== "42703"
        ) {
          throw statusError;
        }
        for (const row of statusRows ?? []) {
          const r = row as { id: string; status: string | null };
          if (r.status) statusById.set(r.id, r.status);
        }
      }

      // ── THE COMMISSIONS, NOT THE COUNTER ON THE LINK ──────────────
      //
      // `referral_links.earnings_eur/_usd` is a running counter, added to
      // by `_referral_link_earnings_add` and taken from by
      // `_claw_back_referral_commission` with a `greatest(..., 0)` clamp.
      // It is not the sum of anything, and it has already drifted:
      //
      //   link         counter   commissions   clawbacks   should be
      //   PSM0007      12.93     9.96          1.99        7.97
      //
      // So this screen showed PSM0005 EUR 27.93 while /affiliates, which
      // sums the rows, showed EUR 22.97 -- the same affiliate, the same
      // day, two admin screens. The rows are the record; the counter is a
      // cache, and nothing should be paid from a cache.
      const linkIds = (data ?? [])
        .map((r) => (r as { id?: string }).id)
        .filter((v): v is string => !!v);
      const emailByLink = new Map<string, string>();
      for (const row of data ?? []) {
        const r = row as {
          id?: string;
          affiliate_advertiser_email: string | null;
        };
        const email = (r.affiliate_advertiser_email ?? "").trim().toLowerCase();
        if (r.id && email) emailByLink.set(r.id, email);
      }

      const sumBy = async (
        table: "referral_commissions" | "referral_clawbacks",
      ) => {
        if (linkIds.length === 0) return [] as Record<string, unknown>[];
        const res = await pageAllRows<Record<string, unknown>>((from, to) =>
          supabase
            .from(table)
            .select("referral_link_id, amount, currency, status")
            .in("referral_link_id", linkIds)
            .order("id", { ascending: true })
            .range(from, to),
        );
        if (res.error) throw new Error(res.error);
        return res.rows;
      };

      const [commissionRows, clawbackRows] = await Promise.all([
        sumBy("referral_commissions"),
        sumBy("referral_clawbacks"),
      ]);

      const out: Record<string, AffiliateEarnings> = {};
      const bump = (linkId: string, cur: string, delta: number) => {
        const email = emailByLink.get(linkId);
        if (!email) return;
        const acc = (out[email] ??= { eur: 0, usd: 0, links: 0 });
        if (cur === "USD") acc.usd += delta;
        else acc.eur += delta;
      };

      // Count the links first, so an affiliate with links but no
      // commission yet still appears with 0.00 rather than vanishing.
      for (const row of data ?? []) {
        const r = row as { id?: string; affiliate_advertiser_email: string | null };
        const email = (r.affiliate_advertiser_email ?? "").trim().toLowerCase();
        if (!email) continue;
        // A rejected link earns nothing, and counting it would show an
        // affiliate money they are not owed.
        const status = r.id ? statusById.get(r.id) : undefined;
        if ((status ?? "").toLowerCase() === "rejected") continue;
        const acc = (out[email] ??= { eur: 0, usd: 0, links: 0 });
        acc.links += 1;
      }

      const live = new Set(
        (data ?? [])
          .map((r) => (r as { id?: string }).id)
          .filter((id): id is string =>
            !!id && (statusById.get(id) ?? "").toLowerCase() !== "rejected",
          ),
      );

      for (const row of commissionRows) {
        const r = row as {
          referral_link_id?: string;
          amount?: number | string | null;
          currency?: string | null;
          status?: string | null;
        };
        if (!r.referral_link_id || !live.has(r.referral_link_id)) continue;
        // A reversed commission is already undone; counting it and its
        // clawback would take it off twice.
        if ((r.status ?? "").toLowerCase() === "reversed") continue;
        bump(
          r.referral_link_id,
          String(r.currency ?? "EUR").toUpperCase(),
          Number(r.amount) || 0,
        );
      }
      for (const row of clawbackRows) {
        const r = row as {
          referral_link_id?: string;
          amount?: number | string | null;
          currency?: string | null;
        };
        if (!r.referral_link_id || !live.has(r.referral_link_id)) continue;
        bump(
          r.referral_link_id,
          String(r.currency ?? "EUR").toUpperCase(),
          -(Number(r.amount) || 0),
        );
      }
      return out;
    },
  });

  return { byEmail: data ?? {}, isError, isLoading };
}
