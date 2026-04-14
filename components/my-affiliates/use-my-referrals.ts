import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { MyReferral } from "./types";

export type UseMyReferralsParams = {
  affiliateAdvertiserId?: string;
  tenantId?: string;
  search?: string;
  page?: number;
  perPage?: number;
  enabled?: boolean;
};

export default function useMyReferrals(params: UseMyReferralsParams = {}) {
  const supabase = createClient();

  const queryKey = useMemo(
    () => [
      "my-referrals",
      params.affiliateAdvertiserId ?? "",
      params.tenantId ?? "",
      params.search ?? "",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      params.affiliateAdvertiserId,
      params.tenantId,
      params.search,
      params.page,
      params.perPage,
    ],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: MyReferral[]; total: number } | undefined
  >({
    queryKey,
    enabled: params.enabled ?? true,
    queryFn: async () => {
      const page = params.page ?? 1;
      const perPage = params.perPage ?? 10;
      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      let query = supabase
        .from("referral_links_with_details")
        .select("*", { count: "exact" });

      if (params.tenantId) {
        query = query.eq("tenant_id", params.tenantId);
      }

      if (params.affiliateAdvertiserId) {
        query = query.eq("affiliate_advertiser_id", params.affiliateAdvertiserId);
      }

      if (params.search?.trim()) {
        const q = params.search.trim();
        query = query.or(
          `referred_advertiser_email.ilike.%${q}%,referred_advertiser_name.ilike.%${q}%,referred_advertiser_tenant_client_code.ilike.%${q}%`,
        );
      }

      const { data: rows, error: qError, count } = await query
        .order("referred_advertiser_name", { ascending: true })
        .range(start, end);

      if (qError) throw qError;

      const mappedRows = ((rows ?? []) as MyReferral[]).map((row) => ({
        ...row,
        affiliate_user_id: row.affiliate_advertiser_id,
        advertiser_id: row.referred_advertiser_id,
        tenant_client_code: row.referred_advertiser_tenant_client_code,
        full_name: row.referred_advertiser_name,
        email: row.referred_advertiser_email,
      }));

      return {
        items: mappedRows,
        total: count ?? (rows ?? []).length,
      };
    },
  });

  return {
    referrals: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
  };
}
