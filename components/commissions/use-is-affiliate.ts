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
      // ── THE CHICKEN AND THE EGG ──────────────────────────────────
      //
      // This counted ACTIVE referral links, which is "has already been
      // credited with somebody", not "is an affiliate". So the owner
      // could approve someone, set their commission, and that person
      // opened Affiliate program to find the JOIN offer — not their
      // link. The only way to create their first link is for an admin
      // to name them the referrer of an ALREADY-EXISTING referred
      // advertiser, so the person who was just approved could not
      // recruit anybody themselves. Pressing Join again answered "You
      // are already on the affiliate program", which closed the circle.
      //
      // An affiliate is somebody the owner has agreed terms with. That
      // lives on their advertisers row, where the Commission dialog
      // writes it and where assignAffiliateToAdvertiser copies it from.
      // Either signal is enough: terms agreed, or a link already live.
      let query = supabase
        .from("referral_links")
        .select("id", { count: "exact", head: true })
        .eq("affiliate_advertiser_id", advertiserId)
        .eq("status", "active");

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { count, error } = await query;
      if (!error && (count ?? 0) > 0) return true;

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

      // No link yet. Have terms been agreed? commission_type is on the
      // advertisers row; "none" and null both mean no arrangement, and
      // an advertiser may read their own row.
      //
      // A column the live table has not got answers 42703, and that
      // must NOT be reported as "you are not an affiliate" — it is an
      // unknown. The link count above already answered false for the
      // ordinary case, so this returns false only when the read worked.
      const { data: terms, error: termsError } = await supabase
        .from("advertisers")
        .select("commission_type, commission_pct, commission_onetime, commission_monthly")
        .eq("id", advertiserId)
        .maybeSingle();

      if (termsError) {
        // A missing column is "no terms recorded", not a failure worth
        // throwing over — the feature simply stays dark. Anything else
        // is a read we could not make, and an entitlement must not be
        // denied on a read we could not make.
        if (!/42703|does not exist|schema cache|PGRST20\d/i.test(termsError.message)) {
          throw termsError;
        }
        return false;
      }

      const row = (terms ?? {}) as {
        commission_type?: string | null;
        commission_pct?: number | string | null;
        commission_onetime?: number | string | null;
        commission_monthly?: number | string | null;
      };
      const type = String(row.commission_type ?? "").trim().toLowerCase();
      const hasType = type !== "" && type !== "none";
      const hasFigure =
        Number(row.commission_pct) > 0 ||
        Number(row.commission_onetime) > 0 ||
        Number(row.commission_monthly) > 0;

      return hasType || hasFigure;
    },
    // A blip is a blip. Three tries before anybody is told they are not an
    // affiliate.
    retry: 2,
  });

  if (profile?.role === "admin")
    return { isAffiliate: true, isLoading: false, isError: false };

  return { isAffiliate: !!isAffiliate, isLoading, isError };
}
