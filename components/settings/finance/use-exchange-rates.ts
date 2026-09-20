import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import type { ExchangeRate } from "@/lib/types/exchange-rates";
import { useQuery } from "@tanstack/react-query";

// The browser Supabase client is created without the Database generic, so
// every query it returns is `any[]`. That is why a caller could hand ONE rate
// row to a parameter declared `MinimalRate[]` and have tsc stay silent while
// every non-USD conversion quietly became zero. Naming the shape here is the
// cheapest place to stop that: it costs nothing at runtime and turns the same
// mistake into a compile error at the call site.
//
// `profile` is the embedded user_profiles row the select asks for; it is only
// used to say who last changed a rate.
export type ExchangeRateRow = ExchangeRate & {
  id: string;
  profile?: {
    id?: string | null;
    full_name?: string | null;
    email?: string | null;
  } | null;
};

export default function useExchangeRates({
  activeOnly = false,
}: {
  activeOnly?: boolean;
}) {
  const { profile } = useAppContext();
  const {
    data: exchangeRates,
    isLoading,
    isError,
    error,
  } = useQuery({
    // ── ONE PREFIX, AND THE TENANT IN THE KEY ───────────────────────
    //
    // These were two unrelated keys, "exchange-rates" and
    // "exchange-rates-active-only", and the settings form invalidates
    // only the first. React Query matches element-wise, so saving a new
    // rate never refreshed the ACTIVE one -- the key eleven surfaces
    // quote from, with staleTime 30s and refetchOnWindowFocus off. The
    // confirm modal's "before" column came from that stale cache, so an
    // owner checking 0.86 -> 0.92 saw 0.86 again next time.
    //
    // And no tenant_id: the query filters by tenant, the key did not,
    // so after a profile switch tenant A's rate was served inside
    // tenant B's top-up and exchange dialogs for the cache's lifetime.
    // use-usd-to-eur already keys on the tenant; these two disagreed by
    // construction.
    queryKey: [
      "exchange-rates",
      profile?.tenant_id ?? null,
      activeOnly ? "active" : "all",
    ],
    queryFn: async (): Promise<ExchangeRateRow[]> => {
      const supabase = createClient();
      const query = supabase
        .from("exchange_rates")
        .select("*, profile:user_profiles(*)")
        .eq("tenant_id", profile?.tenant_id);

      if (activeOnly) {
        query.eq("is_active", true);
      }

      const { data, error } = await query.order("created_at", {
        ascending: false,
      });

      if (error) throw error;

      return data;
    },
  });

  return { exchangeRates, isLoading, isError, error };
}
