import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/cron-auth";
import { alarm, runSystemBackup } from "@/lib/backup-run";
import { safeErrorMessage } from "@/lib/pure-error";

// De dagelijkse backup van het hele systeem. Zie lib/backup-run.ts.
//
// Geen maintenanceGuard: dit leest alleen, en tijdens een incident is
// een verse kopie juist het eerste wat je wilt hebben.

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  if (!isCronAuthorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    return NextResponse.json({ error: "Supabase server env not configured" }, { status: 500 });
  }
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  try {
    const r = await runSystemBackup(db, url, key);
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e) {
    // Faalt het al voor er iets in de zip zit, dan komt er ook geen mail.
    // Het alarm is dan het enige teken -- een backup die stil wegvalt is
    // erger dan een die luid faalt.
    await alarm(db, `De backup liep vast: ${safeErrorMessage(e)}`.slice(0, 400));
    return NextResponse.json({ ok: false, error: safeErrorMessage(e) }, { status: 500 });
  }
}
