"use client";

import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

// Maps advertiser_id -> community name for the given advertisers.
//
// A "community" is a plans row with kind='community' that the advertiser is
// on via advertiser_plans.plan_id (per the user's decision: community = the
// advertiser's plan). Two flat reads instead of a PostgREST embed so it stays
// robust regardless of FK-embed availability; RLS scopes both tables to the
// tenant.
//
// It used to swallow `isError` and return an empty map on any failure, so a
// failed read of advertiser_plans or plans looked exactly like "this
// customer is in no community" -- on the verify desk, where the community
// carries the customer's default fee. The map still falls back to empty so
// no caller crashes, but `isError` comes out with it.
export function useAdvertiserCommunities(
  advertiserIds: (string | null | undefined)[],
): { byAdvertiser: Record<string, string>; isError: boolean } {
  const ids = useMemo(
    () =>
      Array.from(
        new Set(advertiserIds.filter((x): x is string => !!x)),
      ).sort(),
    [advertiserIds],
  );

  const { data, isError } = useQuery<Record<string, string>>({
    queryKey: ["advertiser-communities", ids],
    enabled: ids.length > 0,
    queryFn: async () => {
      const supabase = createClient();

      const { data: aps, error: apErr } = await supabase
        .from("advertiser_plans")
        .select("advertiser_id, plan_id")
        .in("advertiser_id", ids);
      if (apErr) throw apErr;

      const planIds = Array.from(
        new Set(
          (aps ?? [])
            .map((a) => a.plan_id as string | null)
            .filter((x): x is string => !!x),
        ),
      );
      if (!planIds.length) return {};

      const { data: plans, error: pErr } = await supabase
        .from("plans")
        .select("id, name, kind")
        .in("id", planIds)
        .eq("kind", "community");
      if (pErr) throw pErr;

      const nameById = new Map(
        (plans ?? []).map((p) => [p.id as string, p.name as string]),
      );
      const out: Record<string, string> = {};
      for (const ap of aps ?? []) {
        const pid = ap.plan_id as string | null;
        const name = pid ? nameById.get(pid) : undefined;
        if (name && ap.advertiser_id) out[ap.advertiser_id as string] = name;
      }
      return out;
    },
  });

  return { byAdvertiser: data ?? {}, isError };
}
