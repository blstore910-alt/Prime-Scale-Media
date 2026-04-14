import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { ExtraAdAccount, ExtraAdAccountsQueryParams } from "./types";

export default function useExtraAdAccounts(
  params: ExtraAdAccountsQueryParams = {},
) {
  const { profile } = useAppContext();

  const queryKey = useMemo(
    () => [
      "extra-ad-accounts",
      profile?.tenant_id,
      params.page ?? 1,
      params.perPage ?? 20,
    ],
    [profile?.tenant_id, params.page, params.perPage],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: ExtraAdAccount[]; total: number } | undefined
  >({
    queryKey,
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const { page = 1, perPage = 20 } = params;
      const supabase = createClient();

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      const {
        data: rows,
        error: queryError,
        count,
      } = await supabase
        .from("extra_ad_accounts")
        .select(
          "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
          { count: "exact" },
        )
        .eq("tenant_id", profile?.tenant_id)
        .order("created_at", { ascending: false })
        .range(start, end);

      if (queryError) {
        throw queryError;
      }

      return {
        items: (rows ?? []) as ExtraAdAccount[],
        total: count ?? (rows ?? []).length,
      };
    },
  });

  return {
    extraAdAccounts: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
  };
}
