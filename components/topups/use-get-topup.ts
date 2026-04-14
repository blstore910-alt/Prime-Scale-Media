import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function useGetTopup({ topupId }: { topupId: string | null }) {
  const {
    data: topup,
    isLoading,
    isError,
    error,
  } = useQuery({
    queryKey: ["topup-details", topupId],
    enabled: !!topupId,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("top_ups")
        .select(
          "*,account:ad_accounts(*),advertiser:advertisers(*, profile:user_profiles(*))"
        )
        .eq("id", topupId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  return { topup, isLoading, isError, error };
}
