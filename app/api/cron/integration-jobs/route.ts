import { isMaintenanceMode } from "@/actions/_shared";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { isSupplier1Live } from "@/lib/integrations/autopush";
import { syncSupplierPool } from "@/lib/integrations/sync-pool";
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
/**
 * Keep the ad-account pool fresh without anyone pressing Sync.
 *
 * The pool was only ever as current as the last manual click, so a new
 * supplier account, or one they suspended, was invisible until someone
 * happened to look. That is the wrong way round: the whole reason to mirror
 * their inventory is to be told about it.
 *
 * Every 15 minutes rather than every minute. The supplier's inventory changes
 * on a human timescale — accounts are provisioned and banned in ones, not in
 * bursts — and a minute-by-minute list call on someone else's API for a
 * number that rarely moves is rude and buys nothing. Four calls an hour.
 *
 * This is a READ, so it runs on SUPPLIER1_MODE=live alone and is deliberately
 * NOT behind the auto-push gate: knowing what inventory exists is exactly the
 * thing we want working long before we trust the write path.
 *
 * Tenants are taken from the pool itself. The supplier credentials are one
 * set of env vars for the whole deployment, so the inventory belongs to
 * whichever tenant already mirrors it; a tenant that has never synced has
 * nothing to refresh and is reached by the Sync button instead.
 */
async function syncSupplierPools(
  supabase: Pick<SupabaseClient, "from">,
): Promise<{ ran: boolean; tenants?: number; newAccounts?: number; statusChanges?: number; error?: string }> {
  if (!isSupplier1Live()) return { ran: false };
  if (new Date().getUTCMinutes() % 15 !== 0) return { ran: false };

  // Paged and ORDERED by tenant_id. Reading the first 1000 rows unordered
  // meant that on a pool large enough to exceed one page, a tenant whose rows
  // all sat past row 1000 would never be discovered and so would never sync —
  // silently, forever. Ordering makes the walk deterministic; the page cap
  // stops a pathological pool from turning one cron tick into a full scan.
  const PAGE = 1000;
  const MAX_PAGES = 20;
  const tenantSet = new Set<string>();
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error } = await supabase
      .from("supplier_ad_accounts")
      .select("tenant_id")
      .eq("provider", "supplier1")
      .order("tenant_id", { ascending: true })
      .range(page * PAGE, page * PAGE + PAGE - 1);
    if (error) return { ran: true, error: error.message };
    const rows = (data ?? []) as Array<{ tenant_id: string }>;
    for (const r of rows) tenantSet.add(r.tenant_id);
    if (rows.length < PAGE) break;
  }

  const tenants = [...tenantSet];
  if (!tenants.length) return { ran: true, tenants: 0 };

  const adapter = getSupplier1Adapter();
  let newAccounts = 0;
  let statusChanges = 0;

  for (const tenantId of tenants) {
    const res = await syncSupplierPool(supabase, adapter, tenantId);
    if (!res.ok) {
      console.error("pool sync failed:", res.error);
      continue;
    }
    newAccounts += res.data.newExternalIds.length;
    statusChanges += res.data.statusChanges.length;

    // Only tell anyone when something actually changed. A notification every
    // fifteen minutes saying "nothing happened" is a notification nobody
    // reads, and then neither is the one that matters.
    if (res.data.newExternalIds.length || res.data.statusChanges.length) {
      const parts: string[] = [];
      if (res.data.newExternalIds.length) {
        parts.push(`${res.data.newExternalIds.length} new ad account(s) in the pool`);
      }
      for (const c of res.data.statusChanges.slice(0, 5)) {
        parts.push(`${c.externalId}: ${c.from ?? "unknown"} → ${c.to ?? "unknown"}`);
      }
      try {
        const { data: admins } = await supabase
          .from("user_profiles")
          .select("user_id")
          .eq("tenant_id", tenantId)
          .eq("role", "admin")
          .limit(20);
        for (const a of (admins ?? []) as Array<{ user_id: string }>) {
          await supabase.from("notifications").insert({
            recipient_user_id: a.user_id,
            tenant_id: tenantId,
            type: "supplier_pool_changed",
            payload: {
              new_accounts: res.data.newExternalIds.length,
              status_changes: res.data.statusChanges.length,
              summary: parts.join(" · "),
            },
            is_read: false,
          });
        }
      } catch (err) {
        console.error("pool notify failed:", err instanceof Error ? err.message : "unknown");
      }
    }
  }

  return { ran: true, tenants: tenants.length, newAccounts, statusChanges };
}

async function checkSupplierBalance(
  supabase: Pick<SupabaseClient, "from">,
): Promise<{ checked: boolean; low?: string[]; error?: string }> {
  if (!isSupplier1Live()) {
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

// Alert super-admins when a sensitive rate-limit bucket hits its ceiling in the
// last hour (possible abuse). rate_limit_buckets is global; service-role reads
// it. Only the security-relevant buckets (not heartbeat / client-error noise).
// Hourly gate + 24h throttle per recipient, like the balance check.
const RATE_ABUSE_CEILINGS: Record<string, number> = {
  "financial-request": 30,
  signup: 5,
  "send-invite": 20,
  "accept-invite": 10,
  "gdpr-export": 10,
};

async function checkRateLimitAbuse(
  supabase: Pick<SupabaseClient, "from">,
): Promise<{ checked: boolean; abused?: string[] }> {
  if (new Date().getUTCMinutes() !== 0) return { checked: false };
  const cutoff = new Date(Date.now() - 3600_000).toISOString();
  const { data: buckets } = await supabase
    .from("rate_limit_buckets")
    .select("key, count, window_start")
    .gte("window_start", cutoff)
    .order("count", { ascending: false })
    .limit(50);

  const kind = (k: string) => k.split(":")[0];
  const abused = (
    (buckets ?? []) as Array<{ key: string; count: number }>
  ).filter((b) => {
    const ceil = RATE_ABUSE_CEILINGS[kind(b.key)];
    return ceil != null && b.count >= ceil;
  });
  if (!abused.length) return { checked: true, abused: [] };

  const { data: tenants } = await supabase
    .from("tenants")
    .select("id, owner_id");
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const summary = abused
    .slice(0, 5)
    .map((b) => `${b.key} (${b.count})`)
    .join(", ");

  for (const t of (tenants ?? []) as Array<{
    id: string;
    owner_id: string | null;
  }>) {
    if (!t.owner_id) continue;
    const { data: recent } = await supabase
      .from("notifications")
      .select("id")
      .eq("recipient_user_id", t.owner_id)
      .eq("type", "rate_limit_abuse")
      .gte("created_at", since)
      .limit(1);
    if (recent && recent.length) continue;
    await supabase.from("notifications").insert({
      recipient_user_id: t.owner_id,
      tenant_id: t.id,
      type: "rate_limit_abuse",
      payload: { buckets: abused.length, summary },
      is_read: false,
    });
  }
  return { checked: true, abused: abused.map((b) => b.key) };
}

export async function GET(req: NextRequest) {
  if (!isAuthorised(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // A GET by method, a write by nature: this worker pushes top-ups to the
  // supplier and writes integration_jobs. MAINTENANCE_MODE has to stop it
  // too, or a freeze declared during an incident leaves the one process
  // that talks to an outside system still talking. The queue is durable,
  // so a skipped run is picked up by the next one.
  if (isMaintenanceMode()) {
    return NextResponse.json({ ok: true, skipped: "maintenance" });
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
    let poolSync;
    try {
      poolSync = await syncSupplierPools(supabase);
    } catch (err) {
      poolSync = {
        ran: true,
        error: err instanceof Error ? err.message : "pool sync failed",
      };
    }
    let supplierBalance;
    try {
      supplierBalance = await checkSupplierBalance(supabase);
    } catch (err) {
      supplierBalance = {
        checked: true,
        error: err instanceof Error ? err.message : "balance check failed",
      };
    }
    let rateLimitAbuse;
    try {
      rateLimitAbuse = await checkRateLimitAbuse(supabase);
    } catch (err) {
      rateLimitAbuse = {
        checked: true,
        error: err instanceof Error ? err.message : "rate-abuse check failed",
      };
    }
    return NextResponse.json({
      ok: true,
      ...summary,
      poolSync,
      supplierBalance,
      rateLimitAbuse,
    });
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
