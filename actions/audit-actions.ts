"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * Export audit_events to a CSV string. Super-admin only.
 *
 * The row_id, before_data, and after_data JSON fields go into single
 * columns and get double-quoted. Newlines inside them are preserved
 * so a downstream CSV parser reconstructs them faithfully.
 *
 * Result is returned as a plain string; the /api/audit/export route
 * wraps it in a Response with Content-Disposition.
 */
export async function exportAuditEventsCsv(params: {
  fromIso: string;
  toIso: string;
  table?: string;
  action?: string;
}): Promise<ActionResult<{ csv: string; count: number }>> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Unauthorized" };

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false, error: "Forbidden" };
  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.owner_id !== profile.user_id) {
    return { ok: false, error: "Forbidden (super-admin only)" };
  }

  // Basic input sanity
  const from = new Date(params.fromIso);
  const to = new Date(params.toIso);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    return { ok: false, error: "Invalid date range" };
  }
  if (to.getTime() - from.getTime() > 366 * 86400 * 1000) {
    return { ok: false, error: "Range too wide (max 366 days)" };
  }

  let query = supabase
    .from("audit_events")
    .select("*")
    .eq("tenant_id", profile.tenant_id)
    .gte("occurred_at", from.toISOString())
    .lte("occurred_at", to.toISOString())
    .order("occurred_at", { ascending: false })
    .limit(10_000); // hard cap per call

  if (params.table && params.table !== "all") {
    query = query.eq("table_name", params.table);
  }
  if (params.action && params.action !== "all") {
    query = query.eq("action", params.action);
  }

  const { data, error } = await query;
  if (error) return { ok: false, error: error.message };

  const escape = (v: unknown): string => {
    if (v == null) return "";
    const s = typeof v === "string" ? v : JSON.stringify(v);
    // Quote and double any embedded quotes.
    return `"${s.replace(/"/g, '""')}"`;
  };

  const header = [
    "id",
    "occurred_at",
    "actor_user_id",
    "actor_profile_id",
    "tenant_id",
    "table_name",
    "action",
    "row_id",
    "before_data",
    "after_data",
  ].join(",");

  const rows = (data ?? []).map((r) =>
    [
      r.id,
      r.occurred_at,
      r.actor_user_id,
      r.actor_profile_id,
      r.tenant_id,
      r.table_name,
      r.action,
      r.row_id,
      escape(r.before_data),
      escape(r.after_data),
    ].join(","),
  );

  const csv = [header, ...rows].join("\n");
  return { ok: true, data: { csv, count: rows.length } };
}
