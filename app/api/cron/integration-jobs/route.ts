import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { getSupplier1Adapter } from "@/lib/integrations/supplier1";
import { getWiseAdapter } from "@/lib/integrations/wise";
import { processIntegrationJobs } from "@/lib/integrations/worker";

// Vercel Cron target. Runs on a 1-minute schedule (vercel.json). Two
// auth paths accepted:
//   1. Vercel's own `x-vercel-cron` header — present on real cron
//      invocations and impossible to spoof from outside the platform.
//   2. `Authorization: Bearer <CRON_SECRET>` — for local trigger and
//      manual re-runs during an incident.
//
// Uses the service_role Supabase client because it has to update
// integration_jobs rows without RLS getting in the way; the whole
// worker is server-side and never exposes the key.

export const runtime = "nodejs";
// Cron routes should never be cached.
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

  try {
    const summary = await processIntegrationJobs(
      {
        supabase,
        supplier1: getSupplier1Adapter(),
        wise: getWiseAdapter(),
      },
      { batchSize: 10 },
    );
    return NextResponse.json({ ok: true, ...summary });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "unknown",
      },
      { status: 500 },
    );
  }
}
