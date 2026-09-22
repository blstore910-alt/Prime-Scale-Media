"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

// ── HOW MANY THINGS WAIT FOR THE OWNER ON /affiliates ───────────────────
//
// The owner, 22-09: "misschien moet de super admin ook op het homescherm
// affiliates pending zien". The number counts exactly the rows of "Waiting
// for you" on /affiliates -- applications, affiliates asking to advertise
// too, and customers who signed up through a link and wait for approval --
// so the tile and the list can never disagree.
//
// A column a plak has not added yet counts as "not switched on" (0 for
// that part); any other failed read makes the whole figure unknown (null),
// never a confident zero.

const MISSING = /42703|does not exist|schema cache|PGRST20\d/i;

export function useAffiliatesWaiting(tenantId: string | null | undefined, enabled: boolean) {
  return useQuery<number | null>({
    queryKey: ["affiliates-waiting", tenantId ?? ""],
    enabled: enabled && !!tenantId,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const supabase = createClient();
      const part = async (
        q: PromiseLike<{ count: number | null; error: { message: string } | null }>,
      ): Promise<number | null> => {
        const { count, error } = await q;
        if (error) return MISSING.test(error.message) ? 0 : null;
        return count ?? 0;
      };
      const [applications, upgrades, referrals] = await Promise.all([
        part(
          supabase
            .from("advertisers")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId!)
            .eq("affiliate_status", "applied"),
        ),
        part(
          supabase
            .from("advertisers")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId!)
            .not("upgrade_requested_at", "is", null),
        ),
        part(
          supabase
            .from("referral_links")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId!)
            .eq("status", "pending"),
        ),
      ]);
      if (applications === null || upgrades === null || referrals === null) return null;
      return applications + upgrades + referrals;
    },
  });
}
