import { NextRequest, NextResponse } from "next/server";

import { apiRequireOwner } from "@/lib/auth/api-require-admin";
import { createAdminClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Read one figure out of the database, as the owner, while building.
 *
 * ─────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 *
 * Every number on every screen has to be checked against the database
 * to the cent, and until now that meant the owner pasting a script into
 * the SQL editor and pasting the table back — several times per journey,
 * for sixteen journeys. That round trip was the largest single call on
 * their time.
 *
 * WHY IT IS NOT A HOLE
 *
 * The safety is not in this file and not in what gets typed. It is in
 * who the query runs as:
 *
 *   * `public._ro(text)` is SECURITY DEFINER and OWNED BY `psm_readonly`,
 *     a role that holds `select` on the public schema and nothing else.
 *     A stray `delete` comes back "permission denied" rather than doing
 *     anything.
 *   * That function also forces `transaction_read_only` and a 15s
 *     statement timeout.
 *   * Execute on it is granted to `service_role` alone — revoked from
 *     `anon` and `authenticated`, so no signed-in customer or admin can
 *     reach it from the browser console.
 *
 * This route adds two more gates on top:
 *
 *   * `apiRequireOwner()` — the tenant owner's own session, not an
 *     employee admin's.
 *   * `READONLY_SQL` must be `on`. Unset or anything else and the route
 *     refuses. That is the switch to throw at go-live: one env var, no
 *     deploy.
 *
 * See supabase/checks/PLAK-DIT-11-LEESROL.sql for the role and the
 * function, including the two proofs at the end (a read that works and
 * a write that is refused).
 * ─────────────────────────────────────────────────────────────────────
 */

function enabled(): boolean {
  return (process.env.READONLY_SQL ?? "").toLowerCase() === "on";
}

export async function POST(request: NextRequest) {
  if (!enabled()) {
    return NextResponse.json(
      {
        error:
          "The read-only query endpoint is switched off. Set READONLY_SQL=on to use it while building.",
      },
      { status: 404 },
    );
  }

  const { error: authError } = await apiRequireOwner();
  if (authError) return authError;

  let q: unknown;
  try {
    ({ q } = await request.json());
  } catch {
    return NextResponse.json({ error: "Send { q: \"select …\" }" }, { status: 400 });
  }

  const sql = typeof q === "string" ? q.trim() : "";
  if (!sql) {
    return NextResponse.json({ error: "Send { q: \"select …\" }" }, { status: 400 });
  }
  // Not the security boundary — the role is. This only keeps an obvious
  // mistake from becoming a confusing error message.
  if (sql.length > 8000) {
    return NextResponse.json({ error: "Query too long." }, { status: 400 });
  }

  const admin = await createAdminClient();
  const { data, error } = await admin.rpc("_ro", { q: sql });
  if (error) {
    return NextResponse.json(
      { error: safeErrorMessage(error) },
      { status: 400 },
    );
  }
  return NextResponse.json({ rows: data }, {
    headers: { "Cache-Control": "no-store" },
  });
}
