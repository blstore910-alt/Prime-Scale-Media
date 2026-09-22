import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

// A column the live table has not got (before plak 42) answers 42703 or a
// schema-cache miss. That is "not switched on", never "not an affiliate".
const MISSING = /42703|does not exist|schema cache|PGRST20\d/i;

type AffiliateState = {
  isAffiliate: boolean;
  /** Their application, when they have one open or were refused. */
  application: "applied" | "refused" | null;
  refusalReason: string | null;
};

export default function useIsAffiliate() {
  const { profile } = useAppContext();

  const advertiserId =
    profile?.role === "advertiser" ? profile?.advertiser?.[0]?.id : undefined;
  const tenantId = profile?.tenant_id;

  const { data, isLoading, isError } = useQuery<AffiliateState>({
    queryKey: ["is-affiliate", advertiserId, tenantId],
    enabled: !!advertiserId,
    // Approving happens in the owner's session. Asking again when the
    // customer comes back to the tab is how they see it without a reload.
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient();

      // ── THE OWNER'S ANSWER COMES FIRST (plak 42) ────────────────────
      //
      // An affiliate is somebody the owner approved. That is a status on
      // their own advertisers row now -- applied, approved or refused --
      // and it is also what remembers that they applied: the button used
      // to keep that in component state, so a reload offered "Join" again
      // to somebody whose application was on the owner's desk.
      const { data: row, error: rowError } = await supabase
        .from("advertisers")
        .select("affiliate_status, affiliate_refusal_reason")
        .eq("id", advertiserId)
        .maybeSingle();
      if (rowError && !MISSING.test(rowError.message)) throw rowError;
      if (!rowError) {
        const r = (row ?? {}) as {
          affiliate_status?: string | null;
          affiliate_refusal_reason?: string | null;
        };
        const status = String(r.affiliate_status ?? "").toLowerCase();
        if (status === "approved") {
          return { isAffiliate: true, application: null, refusalReason: null };
        }
        if (status === "applied") {
          return { isAffiliate: false, application: "applied", refusalReason: null };
        }
        if (status === "refused") {
          return {
            isAffiliate: false,
            application: "refused",
            refusalReason: r.affiliate_refusal_reason ?? null,
          };
        }
      }

      // ── NO STATUS ON RECORD: THE SIGNALS FROM BEFORE ───────────────
      //
      // Before plak 42, or for somebody the owner set up by hand: a live
      // referral link, or commission terms agreed on their row. Plak 42
      // marks everybody who has either as approved, so after it this is
      // the rare case, not the rule.
      let query = supabase
        .from("referral_links")
        .select("id", { count: "exact", head: true })
        .eq("affiliate_advertiser_id", advertiserId)
        .eq("status", "active");
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }
      const { count, error } = await query;
      if (!error && (count ?? 0) > 0) {
        return { isAffiliate: true, application: null, refusalReason: null };
      }

      // THROW, do not return false. Returning false resolves the query
      // SUCCESSFULLY with the answer "no", so react-query caches it, never
      // retries, and isError stays false — an entitlement denied on an
      // unknown, permanently, until the tab is closed.
      if (error) throw error;

      const { data: terms, error: termsError } = await supabase
        .from("advertisers")
        .select("commission_type, commission_pct, commission_onetime, commission_monthly")
        .eq("id", advertiserId)
        .maybeSingle();

      if (termsError) {
        // A missing column is "no terms recorded"; anything else is a read
        // we could not make, and an entitlement must not be denied on it.
        if (!MISSING.test(termsError.message)) throw termsError;
        return { isAffiliate: false, application: null, refusalReason: null };
      }

      const t = (terms ?? {}) as {
        commission_type?: string | null;
        commission_pct?: number | string | null;
        commission_onetime?: number | string | null;
        commission_monthly?: number | string | null;
      };
      const type = String(t.commission_type ?? "").trim().toLowerCase();
      const hasType = type !== "" && type !== "none";
      const hasFigure =
        Number(t.commission_pct) > 0 ||
        Number(t.commission_onetime) > 0 ||
        Number(t.commission_monthly) > 0;

      return { isAffiliate: hasType || hasFigure, application: null, refusalReason: null };
    },
    // A blip is a blip. Three tries before anybody is told they are not an
    // affiliate.
    retry: 2,
  });

  if (profile?.role === "admin")
    return {
      isAffiliate: true,
      isLoading: false,
      isError: false,
      application: null,
      refusalReason: null,
    };

  return {
    isAffiliate: !!data?.isAffiliate,
    isLoading,
    isError,
    application: data?.application ?? null,
    refusalReason: data?.refusalReason ?? null,
  };
}
