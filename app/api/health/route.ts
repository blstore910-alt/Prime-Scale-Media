import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
    checks.supabase = error
      ? { ok: false, latencyMs: Date.now() - supaStart, note: error.message }
      : { ok: true, latencyMs: Date.now() - supaStart };
  } catch (err) {
    checks.supabase = {
      ok: false,
      latencyMs: Date.now() - supaStart,
      note: err instanceof Error ? err.message : "unknown",
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

  return NextResponse.json(
    {
      status: overallOk ? "ok" : "degraded",
      checks,
      totalLatencyMs: Date.now() - startedAt,
      at: new Date().toISOString(),
    },
    { status: overallOk ? 200 : 503, headers: { "Cache-Control": "no-store" } },
  );
}
