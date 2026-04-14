import { createClient } from "@/lib/supabase/client";
import { Commission } from "@/lib/types/commission";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type CommissionsQueryParams = {
  currency?: string;
  commissionType?: string;
  search?: string;
  sort?: string;
  createdFrom?: string;
  createdTo?: string;
  page?: number;
  perPage?: number;
};

function buildSortParams(sort?: string) {
  switch (sort) {
    case "commission-desc":
      return { column: "amount", ascending: false };
    case "commission-asc":
      return { column: "amount", ascending: true };
    case "oldest":
      return { column: "created_at", ascending: true };
    case "newest":
    default:
      return { column: "created_at", ascending: false };
  }
}

export default function useCommissions(params: CommissionsQueryParams = {}) {
  const supabase = createClient();

  const queryKey = useMemo(
    () => [
      "commissions",
      params.currency ?? "all",
      params.commissionType ?? "all",
      params.search ?? "",
      params.sort ?? "newest",
      params.createdFrom ?? "",
      params.createdTo ?? "",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      params.currency,
      params.commissionType,
      params.search,
      params.sort,
      params.createdFrom,
      params.createdTo,
      params.page,
      params.perPage,
    ],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: Commission[]; total: number } | undefined
  >({
    queryKey,
    queryFn: async () => {
      const {
        currency,
        commissionType,
        search,
        createdFrom,
        createdTo,
        page = 1,
        perPage = 10,
      } = params;

      let query = supabase
        .from("referral_commissions_with_details")
        .select("*", { count: "exact" });

      if (currency && currency !== "all") {
        query = query.eq("currency", currency);
      }

      if (commissionType && commissionType !== "all") {
        query = query.eq("type", commissionType);
      }

      if (search && search.trim() !== "") {
        const s = search.trim();
        query = query.or(
          `referred_advertiser_tenant_client_code.ilike.%${s}%,referred_advertiser_name.ilike.%${s}%,referred_advertiser_email.ilike.%${s}%,affiliate_advertiser_tenant_client_code.ilike.%${s}%,affiliate_advertiser_name.ilike.%${s}%,affiliate_advertiser_email.ilike.%${s}%`,
        );
      }

      if (createdFrom && createdTo) {
        query = query.gte("created_at", createdFrom).lt("created_at", createdTo);
      }

      const { column, ascending } = buildSortParams(params.sort);
      query = query.order(column, { ascending });

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const {
        data: rows,
        error: qError,
        count,
      } = await query.range(start, end);
      if (qError) throw qError;

      return {
        items: (rows ?? []) as Commission[],
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
