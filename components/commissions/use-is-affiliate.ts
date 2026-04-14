import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function useIsAffiliate() {
  const { profile } = useAppContext();

  const advertiserId =
    profile?.role === "advertiser" ? profile?.advertiser?.[0]?.id : undefined;
  const tenantId = profile?.tenant_id;

  const { data: isAffiliate, isLoading } = useQuery({
    queryKey: ["is-affiliate", advertiserId, tenantId],
    enabled: !!advertiserId,
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("referral_links_with_details")
        .select("id", { count: "exact", head: true })
        .eq("affiliate_advertiser_id", advertiserId);

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { count, error } = await query;

      if (error) return false;
      return (count ?? 0) > 0;
    },
  });

  if (profile?.role === "admin") return { isAffiliate: true, isLoading: false };

  return { isAffiliate: !!isAffiliate, isLoading };
}
