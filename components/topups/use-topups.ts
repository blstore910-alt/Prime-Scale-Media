import { createClient } from "@/lib/supabase/client";
import { Topup } from "@/lib/types/topup";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type TopupsQueryParams = {
  type?: string | undefined;
  source?: string | undefined;
  status?: string | undefined;
  search?: string | undefined;
  sort?: string | undefined;
  page?: number;
  perPage?: number;
};

function buildSortParams(sort?: string) {
  switch (sort) {
    case "amount-desc":
      return { column: "amount_received", ascending: false };
    case "amount-asc":
      return { column: "amount_received", ascending: true };
    case "amount-usd-desc":
      return { column: "amount_usd", ascending: false };
    case "amount-usd-asc":
      return { column: "amount_usd", ascending: true };
    case "fee-desc":
      return { column: "fee", ascending: false };
    case "fee-asc":
      return { column: "fee", ascending: true };
    case "account-asc":
      return { column: "account_name", ascending: true };
    case "account-desc":
      return { column: "account_name", ascending: false };
    case "number-asc":
      return { column: "number", ascending: true };
    case "number-desc":
      return { column: "number", ascending: false };
    case "oldest":
      return { column: "created_at", ascending: true };
    case "newest":
    default:
      return { column: "created_at", ascending: false };
  }
}

export default function useTopups(params: TopupsQueryParams = {}) {
  const supabase = createClient();

  const queryKey = useMemo(
    () => [
      "top-ups",
      params.type ?? "all",
      params.source ?? "all",
      params.status ?? "all",
      params.search ?? "",
      params.sort ?? "newest",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      params.type,
      params.source,
      params.status,
      params.search,
      params.sort,
      params.page,
      params.perPage,
    ]
  );

  const { data, isLoading, isError, error, refetch } = useQuery<
    { items: Topup[]; total: number } | undefined
  >({
    queryKey,
    queryFn: async () => {
      const { type, source, status, search, page = 1, perPage = 10 } = params;

      let query = supabase.from("top_ups_view").select(`*`, { count: "exact" });
      // let query = supabase.from("top_ups").select(
      //   `
      //     *,
      //     account:ad_accounts(*),
      //     advertiser:advertisers(
      //       tenant_client_code,
      //       profile:user_profiles(full_name,email)
      //     )
      //   `,
      //   { count: "exact" }
      // );

      if (type && type !== "all") {
        query = query.eq("type", type);
      }
      if (source && source !== "all") {
        query = query.eq("source", source);
      }
      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      if (search && search.trim() !== "") {
        const s = search.trim();

        const orPatterns: string[] = [`tenant_client_code.ilike."%${s}%"`];

        if (!isNaN(Number(s))) {
          orPatterns.push(`number.eq.${Number(s)}`);
        }

        query = query.or(orPatterns.join(","));
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

      const results = (rows ?? []) as Topup[];

      if (column && column.includes("account_name")) {
        results.sort((a, b) => {
          const aName = a.account?.name ?? "";
          const bName = b.account?.name ?? "";
          if (aName < bName) return ascending ? -1 : 1;
          if (aName > bName) return ascending ? 1 : -1;
          return 0;
        });
      }

      return { items: results, total: count ?? results.length };
    },
  });

  return {
    topups: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
    refetch,
  };
}
