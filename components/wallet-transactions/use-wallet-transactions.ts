import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { WalletTopupWithAdvertiser } from "@/lib/types/wallet-topup";
import { safeIlikeTerm } from "@/lib/utils/search";
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

  const { data, isLoading, isError, error, refetch } = useQuery<
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

      // reference_no is TEXT, zero-padded to 10 by the create RPC — so every
      // real reference starts with at least one '0'. Coercing the term with
      // Number() dropped that padding and the text comparison could never
      // match; the non-numeric branch was a deliberate match-nothing. Both
      // failed into the same empty card as "this top-up doesn't exist", on the
      // screen an admin uses to find a payment before crediting real money.
      // Text match now, same as the sibling ad-account queue.
      if (search && search.trim() !== "") {
        const term = safeIlikeTerm(search.trim());
        if (term.length > 0) {
          query = query.ilike("reference_no", `%${term}%`);
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
    refetch,
  };
}
