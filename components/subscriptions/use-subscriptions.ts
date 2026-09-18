import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { Subscription, SubscriptionsQueryParams } from "./types";

export default function useSubscriptions(params: SubscriptionsQueryParams = {}) {
  const { profile } = useAppContext();

  const queryKey = useMemo(
    () => [
      "subscriptions",
      profile?.tenant_id,
      params.status ?? "all",
      params.date ?? "",
      params.page ?? 1,
      params.perPage ?? 20,
    ],
    [
      profile?.tenant_id,
      params.status,
      params.date,
      params.page,
      params.perPage,
    ],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: Subscription[]; total: number } | undefined
  >({
    queryKey,
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const { status = "all", date, page = 1, perPage = 20 } = params;
      const supabase = createClient();

      let query = supabase
        .from("subscriptions")
        .select(
          "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))",
          { count: "exact" },
        )
        .eq("tenant_id", profile?.tenant_id)
        .order("start_date", { ascending: false })
        .order("created_at", { ascending: false });

      if (status !== "all") {
        query = query.eq("status", status);
      }

      if (date) {
        // ── "ON OR AFTER", WHICH IS WHAT THE LABEL SAYS ───────────────
        //
        // The control is labelled "Started on or after" and this was an
        // equality match, so asking for everything since 1 September
        // returned only plans whose start_date is exactly that day — and
        // an operator reads that as "nothing started since then".
        query = query.gte("start_date", date);
      }

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const {
        data: rows,
        error: queryError,
        count,
      } = await query.range(start, end);

      if (queryError) {
        throw queryError;
      }

      return {
        items: (rows ?? []) as Subscription[],
        total: count ?? (rows ?? []).length,
      };
    },
  });

  return {
    subscriptions: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
  };
}

