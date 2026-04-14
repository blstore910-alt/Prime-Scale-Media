"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { ActivityLog } from "@/lib/types/activity-log";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type ActivityLogsQueryParams = {
  action?: string;
  dbAction?: string;
  page?: number;
  perPage?: number;
};

export default function useActivityLogs(params: ActivityLogsQueryParams = {}) {
  const { profile } = useAppContext();

  const queryKey = useMemo(
    () => [
      "activity-logs",
      profile?.tenant_id,
      params.action ?? "all",
      params.dbAction ?? "all",
      params.page ?? 1,
      params.perPage ?? 10,
    ],
    [
      profile?.tenant_id,
      params.action,
      params.dbAction,
      params.page,
      params.perPage,
    ],
  );

  const { data, isLoading, isError, error } = useQuery<
    { items: ActivityLog[]; total: number } | undefined
  >({
    queryKey,
    enabled: profile?.role === "admin" && !!profile?.tenant_id,
    queryFn: async () => {
      const { action, dbAction, page = 1, perPage = 10 } = params;
      const supabase = createClient();

      let query = supabase
        .from("logs")
        .select(
          "id, created_at, action, db_action, table_name, data_snapshot, reference_record_id, author:author_profile_id(full_name, email)",
          { count: "exact" },
        )
        .eq("tenant_id", profile?.tenant_id)
        .order("created_at", { ascending: false });

      if (action && action !== "all") {
        query = query.eq("action", action);
      }

      if (dbAction && dbAction !== "all") {
        query = query.eq("db_action", dbAction);
      }

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const { data: rows, error: qError, count } = await query.range(
        start,
        end,
      );
      if (qError) throw qError;

      return {
        items: (rows ?? []) as ActivityLog[],
        total: count ?? (rows ?? []).length,
      };
    },
  });

  return {
    logs: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
  };
}
