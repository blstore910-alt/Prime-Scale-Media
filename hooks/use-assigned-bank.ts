"use client";

import { useQuery } from "@tanstack/react-query";

import { createClient } from "@/lib/supabase/client";

/**
 * THE BANK THE OWNER PUT ON THIS CUSTOMER AT THE INVITE.
 *
 * The owner, 28-09: "bij aanmelding iedereen wallet topup naar turlit
 * behalve GH mensen naar zanel". The top-up dialog works the
 * destination out from the ad accounts somebody holds — which is
 * exactly what a customer who just signed up does not have — so a GH
 * customer was sent to TURLIT on their very first transfer. This is the
 * answer for that stretch.
 *
 * ── WHY IT IS ITS OWN READ ────────────────────────────────────────
 *
 * `advertisers.bank_group` arrives with plak 128, and plaks are pasted
 * by hand whenever somebody gets to it — code reaches production in
 * minutes. CLAUDE.md is blunt about what happens then: a select naming
 * a column that does not exist yet does not degrade, it THROWS, and
 * PostgREST's message lands on whatever screen asked for it. A customer
 * read that across their own dashboard once already.
 *
 * So it is not added to the profile select, where it would take the
 * whole dashboard down with it. It is asked for on its own, and a
 * missing column answers null — which the routing reads as "not said",
 * which is TURLIT, which is what every customer gets today. The feature
 * stays dark until the plak lands instead of the screen breaking.
 */
const MISSING = /42703|does not exist|schema cache|PGRST20\d/i;

export function useAssignedBank(advertiserId: string | null | undefined) {
  return useQuery<string | null>({
    queryKey: ["assigned-bank", advertiserId ?? ""],
    enabled: !!advertiserId,
    // It changes when the owner changes it, which is rare, and a stale
    // answer here would put a transfer at the wrong company.
    refetchOnWindowFocus: true,
    staleTime: 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("advertisers")
        .select("bank_group")
        .eq("id", advertiserId!)
        .maybeSingle();

      if (error) {
        if (MISSING.test(error.message)) return null;
        // NOT null on a real failure. Null means "nothing assigned",
        // which routes to TURLIT — and quietly routing a ZANEL customer
        // to TURLIT because a read failed is the same class of fault
        // the top-up dialog already carries four notes about. Throwing
        // leaves the query in error, and the dialog keeps saying it
        // could not work the destination out.
        throw error;
      }
      const row = data as { bank_group?: string | null } | null;
      return row?.bank_group ?? null;
    },
  });
}

export default useAssignedBank;
