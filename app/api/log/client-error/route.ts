import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { isChunkLoadFailure } from "@/lib/pure-chunk-error";
import { safeErrorMessage } from "@/lib/pure-error";
import { callerIp, LIMITS, rateLimitCheck } from "@/lib/rate-limit";

export const runtime = "nodejs";

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
  stack: z.string().max(10_000).optional(),
  url: z.string().max(2000).optional(),
  userAgent: z.string().max(500).optional(),
  componentStack: z.string().max(10_000).optional(),
  extra: z.record(z.string(), z.unknown()).optional(),
});

/**
 * POST /api/log/client-error
 *
 * Sink for uncaught React errors, boundary catches, and any
 * `window.onerror`. Attaches the caller's user_id + profile_id
 * server-side (never trusted from the payload) so we can correlate.
 *
 * Body is always accepted (never blocks the user's flow); if the
 * DB write fails we just server-log it. Rate-limit lives at the
 * infra layer — this endpoint is intentionally permissive because
 * losing an error report is worse than accepting a spurious one.
 */
export async function POST(req: Request) {
  const ip = callerIp(req);
  const allowed = await rateLimitCheck(LIMITS.clientErrorLog, `ip:${ip}`);
  if (!allowed) {
    return NextResponse.json({ ok: false }, { status: 429 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Invalid" }, { status: 400 });
  }
  const { message, stack, url, userAgent, componentStack, extra } = parsed.data;

  let userId: string | null = null;
  let profileId: string | null = null;
  let tenantId: string | null = null;
  try {
    const supabase = await createClient();
    const { data: userData } = await supabase.auth.getUser();
    userId = userData.user?.id ?? null;
    if (userId) {
      const { data: profile } = await supabase
        .from("user_profiles")
        .select("id, tenant_id")
        .eq("user_id", userId)
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      profileId = profile?.id ?? null;
      tenantId = profile?.tenant_id ?? null;
    }
  } catch {
    // resolving caller is best-effort — don't fail the log write.
  }

  // Prefer a structured server log over a DB write to keep the
  // endpoint cheap and to keep client errors out of the audit trail.
  // If you want persistence, add a `client_error_events` table and
  // switch this to an insert.
  console.error("client-error", {
    ts: new Date().toISOString(),
    userId,
    profileId,
    tenantId,
    url,
    userAgent,
    message: safeErrorMessage({ message }),
    stack,
    componentStack,
    extra,
  });

  // ── EEN BUG IS OOK EEN ALARM ──────────────────────────────────────
  //
  // De eigenaar, 01-10: "+ als er een bug in het systeem is" -- een mail
  // en een melding. raise_integration_failure houdt herhalingen tegen
  // (een melding per uur per bron zolang hij ongelezen is), en de webhook
  // maakt er een mail van (lib/alert-emails.ts). Een "nieuwe versie"-
  // fout na een deploy is geen bug en gaat er niet in. Alleen voor een
  // ingelogde gebruiker: zonder tenant weten we niet wie te waarschuwen.
  if (tenantId && !isChunkLoadFailure({ message }, url)) {
    try {
      const admin = await createAdminClient();
      await admin.rpc("raise_integration_failure", {
        p_tenant_id: tenantId,
        p_source: "app",
        p_detail: `${safeErrorMessage({ message }).slice(0, 300)}${url ? ` -- op ${url.slice(0, 150)}` : ""}`,
      });
    } catch {
      // Een alarm dat niet lukt, mag het foutrapport niet laten mislukken.
    }
  }

  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
}
