import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { isMaintenanceMode } from "@/actions/_shared";
import { isCronAuthorised } from "@/lib/cron-auth";
import { refreshExchangeRates } from "@/lib/refresh-exchange-rates";
import { syncWiseToSupplier } from "@/lib/supplier-wise-sync";

// ── THE HOURLY RATE ─────────────────────────────────────────────────
//
// Until now the rate was whatever somebody last typed. "Apply Latest
// Rates" fills the form and the owner still has to press Save, so the
// stored figure was only as fresh as the last time two buttons were
// pressed. Measured 27-09: the live tenant's rate was TEN DAYS OLD, and
// every EUR/USD conversion in the app ran on it — the EUR 50 request
// fee, wallet exchanges, converted payouts.
//
// The owner chose hourly over daily, and the reason is arbitrage rather
// than accuracy: EUR/USD moves 0.5-1% in a day and 0.1-0.3% in an hour.
// On a EUR 10,000 exchange a day-old rate is worth EUR 50-100 to
// somebody who waits for it to fall their way; an hour-old one is worth
// EUR 10-30, which is not worth anyone's morning.
//
// WHY NOT FETCH LIVE PER CALCULATION, which was the other option:
//   - the preview a customer sees and the amount they are charged would
//     run on two different rates seconds apart
//   - every money path would then depend on an unauthenticated CDN
//   - and there would be no answer to "which rate did we use for this
//     invoice", which is the first question in any dispute
// The stored row stays the single source of truth. This job only keeps
// it fresh.
//
// AND IT IS NO LONGER THE ONLY THING THAT DOES. Measured 27-09: this job
// fired once at 08:00:26 and missed 09, 10, 11, 12 and 13. The work moved
// into lib/refresh-exchange-rates.ts so /api/exchange-rates/refresh can do
// the same thing when a reader notices the row has gone stale. Why the
// schedule is not honoured is in Vercel's dashboard; the app no longer
// depends on the answer.

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

  // A rate change re-prices every conversion in the app, so it is a
  // write, and MAINTENANCE_MODE freezes writes. Skipping costs nothing:
  // the next pass stores the same thing.
  if (isMaintenanceMode()) {
    return NextResponse.json({ ok: true, skipped: "maintenance" });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const out = await refreshExchangeRates(supabase);

  // ── AND THE WISE PAYMENTS TO MUXUE (eigenaar 03-10) ────────────────
  // Rides on this 15-minute job rather than adding a cron of its own.
  // Its own try: a Wise hiccup must never turn a good rate refresh into
  // a 502, and a failed rate must not stop the payments either.
  let supplierWise: unknown = null;
  try {
    supplierWise = await syncWiseToSupplier(supabase);
  } catch (e) {
    supplierWise = { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
  return NextResponse.json({ ...out, supplierWise }, { status: out.ok ? 200 : 502 });
}
