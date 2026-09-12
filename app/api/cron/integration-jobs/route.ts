import { createClient, type SupabaseClient } from "@supabase/supabase-js";
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

const LOW_BALANCE_THRESHOLD = 8000;

// Alert super-admins (tenant owners) when the supplier's SPENDABLE balance
// (available_balance, after the DST reserve) drops below the threshold, per
// currency. Gated to run ~hourly (minute 0) and the notification is throttled
// to once / 24h per recipient+currency, so it never spams. Trusted server
// context (service_role) — a direct notifications insert is the same pattern
// the billing/perks crons use.
async function checkSupplierBalance(
  supabase: Pick<SupabaseClient, "from">,
): Promise<{ checked: boolean; low?: string[]; error?: string }> {
  if ((process.env.SUPPLIER1_MODE ?? "mock").toLowerCase() !== "live") {
    return { checked: false };
  }
  if (new Date().getUTCMinutes() !== 0) return { checked: false };

  const bal = await getSupplier1Adapter().getWalletBalance();
  if (!bal.ok) return { checked: true, error: bal.error };

  const low: Array<{ currency: string; available: number }> = [];
  if (bal.data.available_usd < LOW_BALANCE_THRESHOLD)
    low.push({ currency: "USD", available: bal.data.available_usd });
  if (bal.data.available_eur < LOW_BALANCE_THRESHOLD)
    low.push({ currency: "EUR", available: bal.data.available_eur });
  if (!low.length) return { checked: true, low: [] };

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, owner_id");
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();

  for (const t of (tenants ?? []) as Array<{
    id: string;
    owner_id: string | null;
  }>) {
    if (!t.owner_id) continue;
    for (const { currency, available } of low) {
      const { data: recent } = await supabase
        .from("notifications")
        .select("payload")
        .eq("recipient_user_id", t.owner_id)
        .eq("type", "supplier_low_balance")
        .gte("created_at", since)
        .limit(30);
      const already = ((recent ?? []) as Array<{ payload: unknown }>).some(
        (n) => {
          try {
            const p =
              typeof n.payload === "string" ? JSON.parse(n.payload) : n.payload;
            return (p as { currency?: string })?.currency === currency;
          } catch {
            return false;
          }
        },
      );
      if (already) continue;
      await supabase.from("notifications").insert({
        recipient_user_id: t.owner_id,
        tenant_id: t.id,
        type: "supplier_low_balance",
        payload: { currency, available, threshold: LOW_BALANCE_THRESHOLD },
        is_read: false,
      });
    }
  }
  return { checked: true, low: low.map((l) => l.currency) };
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
    let supplierBalance;
    try {
      supplierBalance = await checkSupplierBalance(supabase);
    } catch (err) {
      supplierBalance = {
        checked: true,
        error: err instanceof Error ? err.message : "balance check failed",
      };
    }
    return NextResponse.json({ ok: true, ...summary, supplierBalance });
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
