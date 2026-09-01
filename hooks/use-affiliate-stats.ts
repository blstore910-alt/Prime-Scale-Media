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
      return acc;
    },
    { spend_usd: 0, spend_eur: 0, earnings_usd: 0, earnings_eur: 0, topups: 0 },
  );

  return { rows, totals, isLoading, isError, error, refetch };
}
