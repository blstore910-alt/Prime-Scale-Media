import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isMaintenanceMode } from "@/actions/_shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/health
 *
 * Lightweight liveness/readiness probe. Used by:
 *   - uptime monitors (BetterStack / UptimeRobot / Pingdom)
 *   - load balancer / container orchestrator
 *   - smoke-test script in CI post-deploy
 *
 * Returns HTTP 200 with a JSON summary when everything is reachable.
 * Returns HTTP 503 when a critical dependency is down.
 *
 * Does NOT authenticate the caller — the payload deliberately contains
 * no secrets, only a boolean per dependency.
 */
export async function GET() {
  const startedAt = Date.now();
  const checks: Record<string, { ok: boolean; latencyMs?: number; note?: string }> = {};

  // Supabase reachability
  const supaStart = Date.now();
  try {
    const supabase = await createClient();
    // Cheapest possible query — hits Postgres via PostgREST.
    // Anon RLS on `tenants` will typically return 0 rows for an
    // unauthenticated caller; success = the endpoint is alive.
    const { error } = await supabase.from("tenants").select("id").limit(1);
    // This endpoint is unauthenticated — never echo the raw DB error
    // (it leaks schema/infra detail). Generic note only; detail logged.
    if (error) {
      console.error("health: supabase check failed:", error.message);
    }
    checks.supabase = error
      ? { ok: false, latencyMs: Date.now() - supaStart, note: "query failed" }
      : { ok: true, latencyMs: Date.now() - supaStart };
  } catch (err) {
    console.error(
      "health: supabase check threw:",
      err instanceof Error ? err.message : "unknown",
    );
    checks.supabase = {
      ok: false,
      latencyMs: Date.now() - supaStart,
      note: "unavailable",
    };
  }

  // Env presence (booleans only — no values)
  checks.env = {
    ok:
      !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
      !!process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_OR_ANON_KEY &&
      !!process.env.SUPABASE_SERVICE_ROLE_KEY &&
      !!process.env.PUSH_WEBHOOK_SECRET,
  };

  const overallOk = Object.values(checks).every((c) => c.ok);

  const maintenance = isMaintenanceMode();

  return NextResponse.json(
    {
      status: overallOk ? "ok" : "degraded",
      maintenance,
      checks,
      totalLatencyMs: Date.now() - startedAt,
      at: new Date().toISOString(),
    },
    { status: overallOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
