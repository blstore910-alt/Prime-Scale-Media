import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type WalletTransactionsQueryParams = {
  status?: string | undefined;
  currency?: string | undefined;
  search?: string | undefined;
  page?: number;
  perPage?: number;
};

export default function useWalletTransactions(
  params: WalletTransactionsQueryParams = {},
) {
  const { profile } = useAppContext();

  const queryKey = useMemo(
    () => [
      "wallet-transactions",
      profile?.tenant_id,
      params.status ?? "all",
      params.currency ?? "all",
      params.search ?? "",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      profile?.tenant_id,
      params.status,
      params.currency,
      params.search,
      params.page,
      params.perPage,
    ],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: WalletTopupWithAdvertiser[]; total: number } | undefined
  >({
    queryKey,
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const { status, currency, search, page = 1, perPage = 10 } = params;
      const supabase = createClient();

      let query = supabase
        .from("wallet_topups")
        .select(
          "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
          { count: "exact" },
        )
        .eq("tenant_id", profile?.tenant_id)
        .order("created_at", { ascending: false });

      if (status && status !== "all") {
        query = query.eq("status", status);
      }

      if (currency && currency !== "all") {
        query = query.eq("currency", currency);
      }

      if (search && search.trim() !== "") {
        const term = search.trim();
        const numericOnly = /^\d+$/.test(term);

        if (numericOnly) {
          query = query.eq("reference_no", Number(term));
        } else {
          query = query.eq("reference_no", -1);
        }
      }

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const { data: rows, error: qError, count } = await query.range(
        start,
        end,
      );
      if (qError) throw qError;

      return {
        items: (rows ?? []) as WalletTopupWithAdvertiser[],
        total: count ?? (rows ?? []).length,
      };
    },
  });

  return {
    transactions: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
  };
}
