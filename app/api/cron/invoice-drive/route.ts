import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isCronAuthorised } from "@/lib/cron-auth";
import { alarm } from "@/lib/backup-run";
import { runInvoiceDrive } from "@/lib/invoice-drive-run";
import { safeErrorMessage } from "@/lib/pure-error";

// Elke betaalde factuur als pdf op Google Drive, per maand. Zie
// lib/invoice-drive-run.ts. Zonder Drive-koppeling doet hij niets en
// zegt hij waarom.

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
    const r = await runInvoiceDrive(db);
    if (!r.ok) await alarm(db, `Facturen naar Drive: ${r.failed.length} mislukt, bv. ${r.failed[0]?.error ?? ""}`.slice(0, 400));
    return NextResponse.json(r, { status: r.ok ? 200 : 500 });
  } catch (e) {
    await alarm(db, `Facturen naar Drive liep vast: ${safeErrorMessage(e)}`.slice(0, 400));
    return NextResponse.json({ ok: false, error: safeErrorMessage(e) }, { status: 500 });
  }
}
