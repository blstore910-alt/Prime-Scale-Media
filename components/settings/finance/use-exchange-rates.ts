import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

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
    queryKey: [activeOnly ? "exchange-rates-active-only" : "exchange-rates"],
    queryFn: async () => {
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
