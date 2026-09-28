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
// EXCEPT IT DID. /affiliates has a second waiting section, "Payouts
// waiting", and this hook never counted it. The owner, 28-09, looking at
// his own home screen with payout #4 sitting in that queue: "bij super
// admin zie ik niks in wachtrij qua job bijv affiliate payout pending
// ofzo". An affiliate had asked for EUR 75,00 and the home screen said
// nothing at all.
//
// It is counted separately rather than added in, because it is a
// different job: approving an application is a decision, paying out is a
// bank transfer, and one number over two jobs tells you neither. The
// dashboard gives it its own card, next to the other money going OUT.
//
// A column a plak has not added yet counts as "not switched on" (0 for
// that part); any other failed read makes the whole figure unknown (null),
// never a confident zero.

const MISSING = /42703|does not exist|schema cache|PGRST20\d/i;

export type AffiliatesWaiting = {
  /** Applications, advertise-too requests and referrals to approve. */
  decisions: number | null;
  /** Payout requests waiting for a transfer. */
  payouts: number | null;
};

export function useAffiliatesWaiting(tenantId: string | null | undefined, enabled: boolean) {
  return useQuery<AffiliatesWaiting>({
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
        // NOT `count ?? 0`. `count` is parsed out of the content-range
      // HEADER, and postgrest-js leaves it null -- with error null --
      // when that header is missing or unparseable. The docblock at the
      // top of this file promises the caller a null for "could not
      // read", and this line broke that promise: the owner's home
      // screen would state that nobody is waiting while applications
      // and pending referrals sat in /affiliates.
      //
      // use-pending-counts.ts carries the same guard, for the same
      // reason. NaN is caught here too -- it fails `n <= 0`, so it
      // would reach a badge as the literal text "NaN".
      return typeof count === "number" && Number.isFinite(count)
        ? count
        : null;
      };
      const [applications, upgrades, referrals, payouts] = await Promise.all([
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
        // 'requested' is the one open status; the other three
        // (paid/rejected/cancelled) are all finished. Grouped requests
        // carry one row per currency, so a two-currency request counts
        // as two -- which is right: they are two transfers.
        part(
          supabase
            .from("affiliate_payouts")
            .select("id", { count: "exact", head: true })
            .eq("tenant_id", tenantId!)
            .eq("status", "requested"),
        ),
      ]);
      const decisions =
        applications === null || upgrades === null || referrals === null
          ? null
          : applications + upgrades + referrals;
      return { decisions, payouts };
    },
  });
}
