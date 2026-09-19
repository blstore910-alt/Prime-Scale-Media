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

      // ── WHICH PLAN THIS IS ────────────────────────────────────────
      //
      // A monthly amount does not say what somebody is on. The plan
      // name lives two hops away — advertiser_plans.plan_id -> plans —
      // and advertiser_plans is a recent migration, which on this
      // project means it may not be on the database yet. So: ask for
      // it, and on error ask again without it. The column appears when
      // the migration lands instead of taking the whole page down in
      // the meantime.
      const BASE =
        "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email))";
      const WITH_PLAN =
        "*, advertiser:advertisers(tenant_client_code, profile:user_profiles(full_name, email), plan:advertiser_plans(plan:plans(name, kind)))";

      const build = (cols: string) => {
        let q = supabase
          .from("subscriptions")
          .select(cols, { count: "exact" })
          .eq("tenant_id", profile?.tenant_id)
          .order("start_date", { ascending: false })
          .order("created_at", { ascending: false });
        if (status !== "all") q = q.eq("status", status);
        // ── "ON OR AFTER", WHICH IS WHAT THE LABEL SAYS ───────────────
        //
        // The control is labelled "Started on or after" and this was an
        // equality match, so asking for everything since 1 September
        // returned only plans whose start_date is exactly that day — and
        // an operator reads that as "nothing started since then".
        if (date) q = q.gte("start_date", date);
        return q;
      };

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;

      let {
        data: rows,
        error: queryError,
        count,
      } = await build(WITH_PLAN).range(start, end);

      if (queryError) {
        ({ data: rows, error: queryError, count } = await build(BASE).range(
          start,
          end,
        ));
      }

      if (queryError) {
        throw queryError;
      }

      return {
        items: (rows ?? []) as unknown as Subscription[],
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

