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
      // Query the base table (not the *_with_details view — that view
      // predates the status column and doesn't expose it) so we can
      // require an APPROVED link. A pending/rejected referral must NOT
      // make an advertiser count as an affiliate. RLS lets an advertiser
      // read their own referral_links rows.
      let query = supabase
        .from("referral_links")
        .select("id", { count: "exact", head: true })
        .eq("affiliate_advertiser_id", advertiserId)
        .eq("status", "active");

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
