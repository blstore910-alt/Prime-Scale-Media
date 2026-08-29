import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
export async function POST() {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) {
    return NextResponse.json({ ok: false }, { status: 401 });
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
