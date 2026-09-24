"use client";

import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listActiveAdAccountTypes } from "@/actions/ad-account-type-actions";
import {
  AD_ACCOUNT_TYPE_SEED,
  type AdAccountTypeOption,
} from "@/lib/types/ad-account-type";

// Shared source of ad-account types for the create/update forms. Reads
// the tenant's active types from the DB; falls back to the seed list so
// the dropdown is never empty (fresh tenant, or a transient error).
export function useAdAccountTypes() {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["ad-account-types", "active"],
    queryFn: async () => {
      const res = await listActiveAdAccountTypes();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    staleTime: 60_000,
  });

  // ── THE SEED IS A FALLBACK FOR AN EMPTY TABLE, NOT FOR A FAILED READ ──
  //
  // `if (data && data.length > 0)` treated undefined -- which is what a
  // refused or dropped read leaves behind -- exactly like a fresh tenant
  // with no types yet, and handed out the seed. The seed is 5% for
  // everything and 6% for TikTok; this tenant's real defaults are 3%,
  // 3%, 4%, 3%, 3%. So a failed read filled the fee box with FIVE where
  // the answer was three, under six Meta options instead of three --
  // including the three the tenant has switched off -- and that number
  // is written onto the ad account and is what we earn on every top-up
  // for the life of it.
  //
  // Worse, it defeated the guard that was written for this: the create
  // dialog only warns when the slug is not in the map, and with the seed
  // in place it always is. So the warning could never fire.
  //
  // Now the seed is used only when the query SUCCEEDED and came back
  // empty. On a failure the map is empty and the callers' own
  // "we couldn't read this" paths do their job.
  const types: AdAccountTypeOption[] = useMemo(() => {
    if (data && data.length > 0) return data;
    if (isError || data === undefined) return [];
    return AD_ACCOUNT_TYPE_SEED.map((s) => ({
      label: s.label,
      slug: s.slug,
      platform_group: s.platform_group,
      default_fee_pct: s.default_fee_pct,
    }));
  }, [data, isError]);

  const options = useMemo(
    () => types.map((t) => ({ label: t.label, value: t.slug })),
    [types],
  );

  const bySlug = useMemo(() => {
    const m = new Map<string, AdAccountTypeOption>();
    for (const t of types) m.set(t.slug, t);
    return m;
  }, [types]);

  return { types, options, bySlug, isLoading, isError };
}
