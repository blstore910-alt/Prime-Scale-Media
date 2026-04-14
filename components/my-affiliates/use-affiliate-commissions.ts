import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { AffiliateCommission } from "./types";

export type UseAffiliateCommissionsParams = {
  referralLinkId?: string;
  tenantId?: string;
  page?: number;
  perPage?: number;
  enabled?: boolean;
};

export default function useAffiliateCommissions(
  params: UseAffiliateCommissionsParams = {},
) {
  const supabase = createClient();

  const queryKey = useMemo(
    () => [
      "affiliate-commissions",
      params.referralLinkId ?? "",
      params.tenantId ?? "",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      params.referralLinkId,
      params.tenantId,
      params.page,
      params.perPage,
    ],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: AffiliateCommission[]; total: number } | undefined
  >({
    queryKey,
    enabled: params.enabled ?? true,
    queryFn: async () => {
      const page = params.page ?? 1;
      const perPage = params.perPage ?? 10;
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      let query = supabase
        .from("referral_commissions")
        .select("*", { count: "exact" });

      if (params.tenantId) {
        query = query.eq("tenant_id", params.tenantId);
      }
      if (params.referralLinkId) {
        query = query.eq("referral_link_id", params.referralLinkId);
      }

      const { data: rows, error: qError, count } = await query
        .order("created_at", { ascending: false })
        .range(start, end);

      if (qError) throw qError;

      return {
        items: (rows ?? []) as AffiliateCommission[],
        total: count ?? (rows ?? []).length,
      };
    },
  });

  return {
    commissions: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
  };
}
