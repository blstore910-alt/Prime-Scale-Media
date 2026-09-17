"use client";

import { createClient } from "@/lib/supabase/client";
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
): { byEmail: Record<string, AffiliateEarnings>; isError: boolean } {
  const { data, isError } = useQuery<Record<string, AffiliateEarnings>>({
    queryKey: ["affiliate-earnings-by-email", tenantId],
    enabled: !!tenantId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("referral_links_with_details")
        .select(
          "affiliate_advertiser_email, earnings_eur, earnings_usd, status",
        )
        .eq("tenant_id", tenantId);
      if (error) throw error;

      const out: Record<string, AffiliateEarnings> = {};
      for (const row of data ?? []) {
        const r = row as {
          affiliate_advertiser_email: string | null;
          earnings_eur: number | string | null;
          earnings_usd: number | string | null;
          status: string | null;
        };
        const email = (r.affiliate_advertiser_email ?? "").trim().toLowerCase();
        if (!email) continue;
        // A rejected link earns nothing, and counting it would show an
        // affiliate money they are not owed.
        if ((r.status ?? "").toLowerCase() === "rejected") continue;

        const acc = (out[email] ??= { eur: 0, usd: 0, links: 0 });
        acc.eur += Number(r.earnings_eur) || 0;
        acc.usd += Number(r.earnings_usd) || 0;
        acc.links += 1;
      }
      return out;
    },
  });

  return { byEmail: data ?? {}, isError };
}
