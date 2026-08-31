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
  const { data, isLoading } = useQuery({
    queryKey: ["ad-account-types", "active"],
    queryFn: async () => {
      const res = await listActiveAdAccountTypes();
      if (!res.ok) throw new Error(res.error);
      return res.data;
    },
    staleTime: 60_000,
  });

  const types: AdAccountTypeOption[] = useMemo(() => {
    if (data && data.length > 0) return data;
    return AD_ACCOUNT_TYPE_SEED.map((s) => ({
      label: s.label,
      slug: s.slug,
      platform_group: s.platform_group,
      default_fee_pct: s.default_fee_pct,
    }));
  }, [data]);

  const options = useMemo(
    () => types.map((t) => ({ label: t.label, value: t.slug })),
    [types],
  );

  const bySlug = useMemo(() => {
    const m = new Map<string, AdAccountTypeOption>();
    for (const t of types) m.set(t.slug, t);
    return m;
  }, [types]);

  return { types, options, bySlug, isLoading };
}
