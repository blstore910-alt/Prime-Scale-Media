import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Daily Vercel Cron target (vercel.json). Generates due subscription
// invoices, auto-debits the ones past their 7-day grace, and marks
// past_due + nudges when a wallet can't cover it. All the money-moving
// and idempotency logic lives in the subscription_billing_run() RPC;
// this route is just an authenticated trigger.
//
// Auth mirrors the integration-jobs cron: Vercel's own x-vercel-cron
// header, or Authorization: Bearer <CRON_SECRET> for manual re-runs.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function isAuthorised(req: NextRequest): boolean {
  if (req.headers.get("x-vercel-cron")) return true;
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const auth = req.headers.get("authorization");
  return auth === `Bearer ${secret}`;
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    return NextResponse.json(
      { error: "Supabase server env not configured" },
      { status: 500 },
    );
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("subscription_billing_run");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, summary: data });
}
