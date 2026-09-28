"use client";

import { useAppContext } from "@/context/app-provider";
import { createClient } from "@/lib/supabase/client";
import { useQuery } from "@tanstack/react-query";

/**
 * Every figure may be null: "we could not read it". On a status screen
 * that distinction is the whole point — a 0 over a failed read says
 * nothing needs attention, which is the one thing this page must never
 * say by accident.
 */
export type SystemStatus = {
  activeAdmins24h: number | null;
  auditEvents24h: number | null;
  pendingWalletTopups: number | null;
  pendingAdRequests: number | null;
  pendingTopUps: number | null;
  totalAudit: number | null;
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
          .eq("status", "pending")
          // A deleted top-up is not waiting on anybody. This badge is
          // how an admin decides whether the queue needs working.
          .not("is_deleted", "is", true),
      ]);

      // Promise.all resolves even when an individual query carries an
      // .error, so `count ?? 0` turned an RLS denial or a dropped connection
      // into "nothing is pending" — on the panel an owner opens specifically
      // to check whether anything is pending. Fail loudly instead; the panel
      // reads isError and says so.
      const failed = [
        activeAdmins,
        auditEvents24h,
        totalAudit,
        walletTopups,
        adRequests,
        topUps,
      ].find((r) => r.error);
      if (failed?.error) throw failed.error;

      // ── A STATUS SCREEN MAY NOT GUESS ──────────────────────────
      //
      // `count` comes out of the content-range HEADER, and postgrest-js
      // leaves it null — with `error` null — when that header is
      // missing. `?? 0` turns "we could not read it" into "there are
      // none", and this is the worst screen in the app for that: the
      // whole page exists to say whether anything needs attention, and
      // a confident 0 says no.
      //
      // null travels; the panel prints a dash for it.
      const n = (v: number | null) =>
        typeof v === "number" && Number.isFinite(v) ? v : null;
      return {
        activeAdmins24h: n(activeAdmins.count),
        auditEvents24h: n(auditEvents24h.count),
        totalAudit: n(totalAudit.count),
        pendingWalletTopups: n(walletTopups.count),
        pendingAdRequests: n(adRequests.count),
        pendingTopUps: n(topUps.count),
      };
    },
  });
}
