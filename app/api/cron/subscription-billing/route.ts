import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isMaintenanceMode } from "@/actions/_shared";
import { isCronAuthorised } from "@/lib/cron-auth";

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


export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req)) {
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

  // MAINTENANCE_MODE freezes writes app-wide during an incident — every
  // server action refuses and the banner tells users the app is read-only.
  // This cron ignored it and fired on Vercel's schedule anyway, generating
  // invoices and AUTO-DEBITING every advertiser wallet past its grace
  // window. The one write you most want frozen during a money incident was
  // the one that wasn't.
  //
  // A skipped run costs nothing: the RPC is idempotent, so the next day's
  // pass raises exactly the invoices this one would have.
  if (isMaintenanceMode()) {
    return NextResponse.json({ ok: true, skipped: "maintenance" });
  }

  const { data, error } = await supabase.rpc("subscription_billing_run");
  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, summary: data });
}
