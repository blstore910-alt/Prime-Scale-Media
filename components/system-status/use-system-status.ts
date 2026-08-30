"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

export type SystemStatus = {
  activeAdmins24h: number;
  auditEvents24h: number;
  pendingWalletTopups: number;
  pendingAdRequests: number;
  pendingTopUps: number;
  totalAudit: number;
};

export function useSystemStatus() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;

  return useQuery<SystemStatus>({
    queryKey: ["system-status", tenantId],
    enabled: !!tenantId,
    refetchInterval: 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const dayAgo = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

      const [
        activeAdmins,
        auditEvents24h,
        totalAudit,
        walletTopups,
        adRequests,
        topUps,
      ] = await Promise.all([
        supabase
          .from("user_profiles")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("role", "admin")
          .gte("last_seen_at", dayAgo),
        supabase
          .from("audit_events")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .gte("occurred_at", dayAgo),
        supabase
          .from("audit_events")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId),
        supabase
          .from("wallet_topups")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending"),
        supabase
          .from("ad_account_requests")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending"),
        supabase
          .from("top_ups")
          .select("id", { count: "exact", head: true })
          .eq("tenant_id", tenantId)
          .eq("status", "pending"),
      ]);

      return {
        activeAdmins24h: activeAdmins.count ?? 0,
        auditEvents24h: auditEvents24h.count ?? 0,
        totalAudit: totalAudit.count ?? 0,
        pendingWalletTopups: walletTopups.count ?? 0,
        pendingAdRequests: adRequests.count ?? 0,
        pendingTopUps: topUps.count ?? 0,
      };
    },
  });
}
