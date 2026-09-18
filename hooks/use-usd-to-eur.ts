"use client";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useQuery } from "@tanstack/react-query";

/**
 * The tenant's active USD→EUR rate, for the few places that have to put two
 * currencies on one scale.
 *
 * It exists because the affiliate tier ladder was adding euros to dollars:
 *
 *     const lifetimeCombined = lifetimeEur + lifetimeUsd;
 *
 * and then printing the gap to the next tier with a euro sign. An affiliate
 * on $1,000 and €0 was shown a tier they had not reached and told "€1,500
 * more" — a euro sentence derived from a number that is not in euros.
 *
 * `exchange_rates` is readable by any profile in the tenant (policy
 * `exchange_rates_select`), so this is a direct read.
 *
 * WHEN THE RATE CANNOT BE READ it returns null rather than 1. A rate of 1
 * would be the same bug with a confident face on it — the caller has to
 * decide what to say when the two currencies cannot be compared, and this
 * hook must not decide it for them by guessing parity.
 */
export function useUsdToEur() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;

  const { data, isError, isLoading } = useQuery({
    queryKey: ["usd-to-eur", tenantId],
    enabled: !!tenantId,
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("exchange_rates")
        .select("eur")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      const eur = Number((data as { eur?: number } | null)?.eur);
      return Number.isFinite(eur) && eur > 0 ? eur : null;
    },
  });

  return {
    /** EUR per 1 USD, or null when it could not be read. */
    rate: data ?? null,
    isLoading,
    isError,
  };
}

export default useUsdToEur;
