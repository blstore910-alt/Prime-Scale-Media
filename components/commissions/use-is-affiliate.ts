import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export default function useIsAffiliate() {
  const { profile } = useAppContext();

  const advertiserId =
    profile?.role === "advertiser" ? profile?.advertiser?.[0]?.id : undefined;
  const tenantId = profile?.tenant_id;

  const {
    data: isAffiliate,
    isLoading,
    isError,
  } = useQuery({
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

      // THROW, do not return false. Returning false resolves the query
      // SUCCESSFULLY with the answer "no", so react-query caches it, never
      // retries, and isError stays false — an entitlement denied on an
      // unknown, permanently, until the tab is closed.
      //
      // What that cost: an APPROVED affiliate whose referral_links read
      // blipped (network, RLS, a tenant filter) was told "Your referral
      // link isn't set up yet — ask an admin to enable the affiliate
      // program for your account." They contact support about an account
      // that works, and reloading the page does not clear it.
      if (error) throw error;
      return (count ?? 0) > 0;
    },
    // A blip is a blip. Three tries before anybody is told they are not an
    // affiliate.
    retry: 2,
  });

  if (profile?.role === "admin")
    return { isAffiliate: true, isLoading: false, isError: false };

  return { isAffiliate: !!isAffiliate, isLoading, isError };
}
