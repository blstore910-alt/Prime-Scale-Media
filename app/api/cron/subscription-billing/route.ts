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
    // ── A FAILED BILLING RUN MUST NOT BE SILENT ─────────────────────
    //
    // This returned a 500 into Vercel's cron log and did nothing else.
    // A run that has failed every night for a week is indistinguishable
    // from one that worked: no invoices are raised, no wallets are
    // debited, and the first sign is a customer noticing they have not
    // been billed since August -- or, worse, nobody noticing at all.
    //
    // The RPC is one transaction, so a failure bills nobody rather than
    // half of them. What is missing is the alarm, and the owner already
    // receives notifications for exactly this class of thing (the
    // integration cron does the same for a low supplier balance).
    //
    // Once per day at most, per owner: a run that fails will fail again
    // tomorrow, and twenty identical alerts is the same as none.
    try {
      const since = new Date(Date.now() - 20 * 3600_000).toISOString();
      const { data: tenants } = await supabase
        .from("tenants")
        .select("id, owner_id");
      for (const t of (tenants ?? []) as Array<{
        id: string;
        owner_id: string | null;
      }>) {
        if (!t.owner_id) continue;
        const { data: recent } = await supabase
          .from("notifications")
          .select("id")
          .eq("recipient_user_id", t.owner_id)
          .eq("type", "billing_run_failed")
          .gte("created_at", since)
          .limit(1);
        if ((recent ?? []).length > 0) continue;
        await supabase.from("notifications").insert({
          recipient_user_id: t.owner_id,
          tenant_id: t.id,
          type: "billing_run_failed",
          // safeErrorMessage is not importable in a route that runs on
          // the service client, and the raw message can carry row data,
          // so only the code and a short, trimmed reason go in.
          payload: {
            code: (error as { code?: string }).code ?? null,
            reason: String(error.message ?? "").slice(0, 200),
            at: new Date().toISOString(),
          },
          is_read: false,
        });
      }
    } catch {
      // The alarm failing must not change the answer to the caller.
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }
  return NextResponse.json({ ok: true, summary: data });
}
