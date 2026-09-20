import { NextResponse } from "next/server";

import { apiRequireAdmin } from "@/lib/auth/api-require-admin";
import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/diag — temporary.
 *
 * Every stats route started returning its own "failed to load" message
 * at once, including two nobody had touched, while /api/health (an
 * anonymous read) stayed green. That combination is only visible from
 * inside: the routes swallow the database's message by design, so a
 * production-only failure has nowhere to surface.
 *
 * This runs the same reads with the same client and returns what the
 * database actually said. ADMIN ONLY and it returns no rows — only a
 * count and an error message per table, and the message goes through
 * safeErrorMessage, which is what keeps Supabase's details/hint/row
 * fields (and the PII in them) out of a response.
 *
 * DELETE THIS once the cause is found.
 */
export async function GET() {
  const { profile, error: authError } = await apiRequireAdmin();
  if (authError) return authError;

  const supabase = await createClient();

  const probe = async (
    name: string,
    run: () => PromiseLike<{ error: unknown; count?: number | null }>,
  ) => {
    try {
      const { error, count } = await run();
      return {
        name,
        ok: !error,
        count: count ?? null,
        error: error ? safeErrorMessage(error) : null,
      };
    } catch (e) {
      return { name, ok: false, count: null, error: safeErrorMessage(e) };
    }
  };

  const tenantId = profile?.tenant_id ?? null;

  const checks = await Promise.all([
    probe("advertisers", () =>
      supabase
        .from("advertisers")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ),
    probe("affiliates", () =>
      supabase
        .from("affiliates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ),
    probe("invoices", () =>
      supabase
        .from("invoices")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ),
    probe("top_ups", () =>
      supabase
        .from("top_ups")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ),
    probe("wallets", () =>
      supabase
        .from("wallets")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ),
    probe("exchange_rates", () =>
      supabase
        .from("exchange_rates")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ),
    probe("referral_commissions", () =>
      supabase
        .from("referral_commissions")
        .select("id", { count: "exact", head: true }),
    ),
    probe("referral_links", () =>
      supabase.from("referral_links").select("id", { count: "exact", head: true }),
    ),
    probe("ad_account_types", () =>
      supabase
        .from("ad_account_types")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
    ),
    probe("user_profiles + joins (what the layout reads)", () =>
      supabase
        .from("user_profiles")
        .select(
          "id, tenant:tenants(*), advertiser:advertisers(id, user_id, tenant_id, profile_id, tenant_client_code, startup_fee, fee_status, airtable, created_at, updated_at)",
          { count: "exact" },
        )
        .eq("user_id", profile?.user_id ?? ""),
    ),
  ]);

  return NextResponse.json({
    tenantId: tenantId ? "present" : "MISSING",
    role: profile?.role ?? null,
    checks,
  });
}
