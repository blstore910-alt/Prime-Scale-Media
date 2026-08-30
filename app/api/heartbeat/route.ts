import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { callerIp, LIMITS, rateLimitCheck } from "@/lib/rate-limit";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/heartbeat
 *
 * Called by the authenticated app once every ~5 minutes. Delegates to
 * the `mark_session_seen()` RPC which throttles the write server-side,
 * so calling it more often is harmless.
 *
 * Purpose: give incident-response the answer to "was this profile
 * active in the last hour?". Used later for the "recently active
 * admins" indicator in the users table.
 */
export async function POST(req: Request) {
  // Auth first — heartbeats only from signed-in users. Anonymous
  // callers get a 401 without spending anyone's rate-limit budget.
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  // Key on user id, not IP. Multiple users behind the same IP (office
  // NAT, VPN, browser test runs) would otherwise share one 60/hour
  // budget and hit 429 on every load. Falls back to IP when we can't
  // read the auth (belt and braces — auth check above already caught
  // that case, so this branch is unreachable today).
  const rateKey = userData.user?.id
    ? `user:${userData.user.id}`
    : `ip:${callerIp(req)}`;
  const allowed = await rateLimitCheck(LIMITS.heartbeat, rateKey);
  if (!allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  const { error } = await supabase.rpc("mark_session_seen");
  if (error) {
    // Non-fatal — heartbeats aren't required to succeed for the app to
    // function. Report but don't leak details.
    return NextResponse.json({ ok: false }, { status: 500 });
  }
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
