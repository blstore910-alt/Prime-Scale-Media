import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function useGetTopup({ topupId }: { topupId: string | null }) {
  const {
    data: topup,
    // ── isPending, NIET isLoading ─────────────────────────────────
    //
    // In react-query v5 is `isLoading` gelijk aan `isPending &&
    // isFetching`, en een query met `enabled: false` haalt niets op --
    // dus isLoading is dan FALSE. Samen met isError false en data
    // undefined maakt dat een vierde toestand die de dialoog hiernaast
    // niet tekent: kop, ondertitel, leeg vak. Op de dialoog die geld
    // naar een ad-account vrijgeeft.
    //
    // use-topups.ts en use-ad-account-requests.ts doen dit allebei al
    // zo; deze hook was de laatste met de rauwe vlag.
    isPending,
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

  return { topup, isLoading: isPending, isError, error };
}
