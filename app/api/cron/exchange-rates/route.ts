import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

import { isMaintenanceMode } from "@/actions/_shared";
import { isCronAuthorised } from "@/lib/cron-auth";
import { getExchangeRate } from "@/lib/get-exchange-rates";
import { safeErrorMessage } from "@/lib/pure-error";
import { rateMoveVerdict } from "@/lib/pure-rate-guard";

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

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RateRow = {
  id: string;
  tenant_id: string;
  eur: number | string | null;
  gbp: number | string | null;
  hkd: number | string | null;
};

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
  // the next hour's pass stores the same thing.
  if (isMaintenanceMode()) {
    return NextResponse.json({ ok: true, skipped: "maintenance" });
  }

  const supabase = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── ASK THE PROVIDER ONCE, FOR EVERY TENANT ──────────────────────
  //
  // One fetch, not one per tenant: it is the same market.
  let fresh: { eur: number; gbp: number; hkd: number };
  try {
    const all = (await getExchangeRate("usd")) as Record<
      string,
      Record<string, number>
    >;
    const usd = all?.usd ?? {};
    fresh = { eur: Number(usd.eur), gbp: Number(usd.gbp), hkd: Number(usd.hkd) };
  } catch (e) {
    // ── A CRON THAT STOPS MUST NOT BE INVISIBLE ────────────────────
    //
    // This returned a 502 to Vercel and said nothing to anybody. The
    // whole reason this job exists is that a rate quietly went ten days
    // stale; a provider that starts refusing would put us straight
    // back there, with the app happily converting on an old number.
    //
    // Measured 27-09: the job ran once at 08:00 and not at 09, 10, 11
    // or 12 -- and the only way anyone found out was by reading
    // updated_at by hand. So: tell the owner, on every tenant, and
    // keep the old rate.
    console.error("exchange-rates cron: provider", safeErrorMessage(e));
    try {
      const { data: tenants } = await supabase
        .from("exchange_rates")
        .select("tenant_id")
        .eq("is_active", true);
      for (const t of (tenants ?? []) as { tenant_id: string }[]) {
        await supabase.rpc("raise_integration_failure", {
          p_tenant_id: t.tenant_id,
          p_source: "exchange_rate",
          p_detail:
            "The hourly rate update could not reach the provider. The previous rate is still in use — check how old it is on Settings → Finance.",
        });
      }
    } catch (inner) {
      console.error("exchange-rates cron: alert", safeErrorMessage(inner));
    }
    return NextResponse.json(
      { ok: false, error: "Could not reach the rate provider" },
      { status: 502 },
    );
  }

  const { data: rows, error } = await supabase
    .from("exchange_rates")
    .select("id, tenant_id, eur, gbp, hkd")
    .eq("is_active", true);
  if (error) {
    console.error("exchange-rates cron: read", safeErrorMessage(error));
    return NextResponse.json(
      { ok: false, error: "Could not read the stored rates" },
      { status: 500 },
    );
  }

  const updated: string[] = [];
  const refused: { tenant: string; reason: string }[] = [];

  for (const row of (rows ?? []) as RateRow[]) {
    // ── THE BAND, PER CURRENCY ─────────────────────────────────────
    //
    // All three have to pass or none is written. A row where EUR moved
    // sensibly and HKD did something absurd is a bad response, not a
    // partially good one — and half a rate row is worse than a stale
    // one, because nothing downstream would know.
    const verdicts = [
      ["eur", rateMoveVerdict(row.eur, fresh.eur)] as const,
      ["gbp", rateMoveVerdict(row.gbp, fresh.gbp)] as const,
      ["hkd", rateMoveVerdict(row.hkd, fresh.hkd)] as const,
    ];
    const bad = verdicts.filter(([, v]) => !v.ok);
    if (bad.length > 0) {
      const reason = bad
        .map(([cur, v]) => `${cur.toUpperCase()} ${v.reason}`)
        .join("; ");
      refused.push({ tenant: row.tenant_id, reason });
      // The owner has to hear about this — a rate that stopped updating
      // is invisible otherwise, which is exactly how it got to ten days
      // old. Best effort: a failed alert must not stop the other
      // tenants being updated.
      try {
        await supabase.rpc("raise_integration_failure", {
          p_tenant_id: row.tenant_id,
          p_source: "exchange_rate",
          p_detail: `Rate not updated: ${reason}. The previous rate is still in use.`,
        });
      } catch (e) {
        console.error("exchange-rates cron: alert", safeErrorMessage(e));
      }
      continue;
    }

    const { error: writeErr } = await supabase
      .from("exchange_rates")
      .update({ eur: fresh.eur, gbp: fresh.gbp, hkd: fresh.hkd })
      .eq("id", row.id);
    if (writeErr) {
      console.error("exchange-rates cron: write", safeErrorMessage(writeErr));
      refused.push({ tenant: row.tenant_id, reason: "write failed" });
      continue;
    }
    updated.push(row.tenant_id);
  }

  return NextResponse.json({
    ok: true,
    fetched: fresh,
    updated: updated.length,
    refused,
  });
}
