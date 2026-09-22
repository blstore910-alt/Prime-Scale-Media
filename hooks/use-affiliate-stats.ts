import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type AffiliateReferralStat = {
  referral_link_id: string;
  referred_advertiser_id: string;
  referred_advertiser_name: string | null;
  referred_advertiser_email: string | null;
  referred_advertiser_code: string | null;
  commission_type: string | null;
  commission_pct: number | null;
  commission_currency: string | null;
  spend_usd: number;
  spend_eur: number;
  topup_count: number;
  earnings_usd: number;
  earnings_eur: number;
  /**
   * WHAT IS STILL OWED, as opposed to what was ever earned.
   *
   * Migration 20260918160000 added these to the RPC precisely so a payout
   * stops asking for money that has already been paid, and nothing in
   * the app ever read them: an affiliate paid EUR 500 on /commissions
   * still saw EUR 500 as their balance and the payout mail asked for it
   * a second time.
   *
   * OPTIONAL, because the RPC on live may predate the migration — and a
   * missing field must not silently become 0, which would read as
   * "nothing owed". Where they are absent, the screen falls back to the
   * lifetime figure and says which one it is showing.
   */
  unpaid_usd?: number | null;
  unpaid_eur?: number | null;
  /**
   * "pending" while the owner has not approved this customer yet (plak
   * 42); "active" after. Absent before plak 42, when only active links
   * were returned at all.
   */
  link_status?: string | null;
};

export type UseAffiliateStatsParams = {
  from?: string | null; // ISO date (yyyy-mm-dd) or null for all-time
  to?: string | null;
  enabled?: boolean;
};

// Reads the caller's own referral book via the owner-checked
// affiliate_referral_stats RPC. The date range is inclusive; `to` is
// widened to end-of-day so a single-day range still captures that day.
export default function useAffiliateStats(params: UseAffiliateStatsParams = {}) {
  const supabase = createClient();

  const fromIso = params.from ? new Date(`${params.from}T00:00:00`).toISOString() : null;
  const toIso = params.to ? new Date(`${params.to}T23:59:59.999`).toISOString() : null;

  const { data, isLoading, isError, error, refetch } = useQuery<
    AffiliateReferralStat[]
  >({
    queryKey: ["affiliate-stats", fromIso ?? "", toIso ?? ""],
    enabled: params.enabled ?? true,
    // The commission is booked when an ADMIN verifies, in another
    // session. The app client turns focus refetching off, so an affiliate
    // with the tab open kept "Commission EUR 0,00" until a full reload.
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("affiliate_referral_stats", {
        p_from: fromIso,
        p_to: toIso,
      });
      if (error) throw error;
      return (data ?? []) as AffiliateReferralStat[];
    },
  });

  const rows = data ?? [];
  const totals = rows.reduce(
    (acc, r) => {
      acc.spend_usd += Number(r.spend_usd) || 0;
      acc.spend_eur += Number(r.spend_eur) || 0;
      acc.earnings_usd += Number(r.earnings_usd) || 0;
      acc.earnings_eur += Number(r.earnings_eur) || 0;
      acc.topups += Number(r.topup_count) || 0;
      // Only counted when the field is genuinely present. `?? 0` here
      // would turn "this RPC does not report unpaid" into "nothing is
      // owed", which is the difference between a payout request and
      // silence.
      if (r.unpaid_usd !== undefined && r.unpaid_usd !== null) {
        acc.unpaid_usd += Number(r.unpaid_usd) || 0;
        acc.hasUnpaid = true;
      }
      if (r.unpaid_eur !== undefined && r.unpaid_eur !== null) {
        acc.unpaid_eur += Number(r.unpaid_eur) || 0;
        acc.hasUnpaid = true;
      }
      return acc;
    },
    {
      spend_usd: 0,
      spend_eur: 0,
      earnings_usd: 0,
      earnings_eur: 0,
      unpaid_usd: 0,
      unpaid_eur: 0,
      /** False when the RPC does not report unpaid at all. */
      hasUnpaid: false,
      topups: 0,
    },
  );

  /**
   * WHAT A PAYOUT SHOULD ASK FOR.
   *
   * The unpaid figure when the RPC reports one, the lifetime figure when
   * it does not — and `isLifetime` says which, so the screen can label it
   * honestly rather than implying a precision it does not have.
   */
  const payable = {
    usd: totals.hasUnpaid ? totals.unpaid_usd : totals.earnings_usd,
    eur: totals.hasUnpaid ? totals.unpaid_eur : totals.earnings_eur,
    isLifetime: !totals.hasUnpaid,
  };

  return { rows, totals, payable, isLoading, isError, error, refetch };
}
