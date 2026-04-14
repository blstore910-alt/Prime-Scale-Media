import { createClient } from "@/lib/supabase/client";
import { AdAccountRequest } from "@/lib/types/ad-account-request";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type AdAccountRequestsQueryParams = {
  search?: string | undefined;
  sort?: string | undefined;
  page?: number;
  perPage?: number;
  advertiserId?: string | undefined;
  tenantId?: string | undefined;
  requesterEmail?: string | undefined;
  enabled?: boolean;
};

function buildSortParams(sort?: string) {
  switch (sort) {
    case "oldest":
      return { column: "created_at", ascending: true };
    case "email-asc":
      return { column: "email", ascending: true };
    case "email-desc":
      return { column: "email", ascending: false };
    case "status-asc":
      return { column: "status", ascending: true };
    case "status-desc":
      return { column: "status", ascending: false };
    case "platform-asc":
      return { column: "platform", ascending: true };
    case "platform-desc":
      return { column: "platform", ascending: false };
    case "newest":
    default:
      return { column: "created_at", ascending: false };
  }
}

export default function useAdAccountRequests(
  params: AdAccountRequestsQueryParams = {},
) {
  const supabase = createClient();

  const queryKey = useMemo(
    () => [
      "ad-account-requests",
      params.search ?? "",
      params.sort ?? "newest",
      params.page ?? 1,
      params.perPage ?? 10,
      params.advertiserId ?? "all",
      params.tenantId ?? "all",
      params.requesterEmail ?? "all",
    ],
    [
      params.search,
      params.sort,
      params.page,
      params.perPage,
      params.advertiserId,
      params.tenantId,
      params.requesterEmail,
    ],
  );

  const { data, isLoading, isError, error, refetch } = useQuery<
    { items: AdAccountRequest[]; total: number } | undefined
  >({
    queryKey,
    enabled: params.enabled ?? true,
    queryFn: async () => {
      const {
        search,
        page = 1,
        perPage = 10,
        advertiserId,
        tenantId,
        requesterEmail,
      } = params;

      let query = supabase
        .from("ad_account_requests")
        .select(
          "*, advertiser:advertisers(id, tenant_client_code, profile:user_profiles(full_name, email))",
          { count: "exact" },
        );

      if (advertiserId) {
        query = query.eq("advertiser_id", advertiserId);
      } else if (requesterEmail) {
        query = query.eq("email", requesterEmail);
      }

      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      if (search && search.trim() !== "") {
        query = query.ilike("email", `%${search.trim()}%`);
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

      const results = (rows ?? []) as AdAccountRequest[];
      return { items: results, total: count ?? results.length };
    },
  });

  return {
    requests: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}
