"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

export type AuditEvent = {
  id: number;
  occurred_at: string;
  actor_user_id: string | null;
  actor_profile_id: string | null;
  tenant_id: string | null;
  table_name: string;
  action: "INSERT" | "UPDATE" | "DELETE";
  row_id: string | null;
  before_data: unknown;
  after_data: unknown;
};

export type AuditEventsParams = {
  table?: string;
  action?: string;
  page?: number;
  perPage?: number;
};

/**
 * Reads from `audit_events` — the append-only source of truth for
 * every business-table mutation. RLS on the table restricts each
 * admin to their own tenant, so this is safe to call from the
 * client without extra filtering.
 */
export default function useAuditEvents(params: AuditEventsParams = {}) {
  const { profile } = useAppContext();
  const { table, action, page = 1, perPage = 50 } = params;

  const queryKey = useMemo(
    () => [
      "audit-events",
      profile?.tenant_id,
      table ?? "all",
      action ?? "all",
      page,
      perPage,
    ],
    [profile?.tenant_id, table, action, page, perPage],
  );

  const { data, isLoading, isError, error } = useQuery<{
    items: AuditEvent[];
    total: number;
  }>({
    queryKey,
    enabled: !!profile?.tenant_id,
    queryFn: async () => {
      const supabase = createClient();
      let query = supabase
        .from("audit_events")
        .select("*", { count: "exact" })
        .order("occurred_at", { ascending: false });

      if (table && table !== "all") query = query.eq("table_name", table);
      if (action && action !== "all") query = query.eq("action", action);

      const start = (page - 1) * perPage;
      const end = start + perPage - 1;
      const { data: rows, count, error: qError } = await query.range(
        start,
        end,
      );
      if (qError) throw qError;
      return {
        items: (rows ?? []) as AuditEvent[],
        total: count ?? (rows ?? []).length,
      };
    },
  });

  return {
    events: data?.items ?? [],
    total: data?.total ?? 0,
    isLoading,
    isError,
    error,
  };
}
