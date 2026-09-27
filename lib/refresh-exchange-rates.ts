import type { SupabaseClient } from "@supabase/supabase-js";

import { getExchangeRate } from "@/lib/get-exchange-rates";
import { safeErrorMessage } from "@/lib/pure-error";
import { rateMoveVerdict } from "@/lib/pure-rate-guard";

// ── THE REFRESH, WITHOUT THE SCHEDULER ──────────────────────────────
//
// This was the body of app/api/cron/exchange-rates/route.ts, and it is out
// here now because the schedule cannot be relied on.
//
// MEASURED ON PRODUCTION, 27-09. The job is registered in vercel.json as
// `0 * * * *`. It ran ONCE, at 08:00:26, moved both tenants from 0,872361
// to 0,87786534 (+0,63%, inside the band) -- and then nothing at 09, 10,
// 11, 12 or 13. Five missed hours. Not a provider failure either: the
// route raises an integration alert on one and there are no alert rows at
// all, so the function did not execute. By 13:31 the stored rate was 5,5
// hours old, and every EUR/USD conversion in the app runs on it -- the
// EUR 50 request fee, wallet exchanges, converted payouts.
//
// Why the schedule is not honoured is in Vercel's dashboard, not in this
// repo, and it is the owner's to look at. But the fix for the APP is the
// same either way: do not depend on somebody else's clock. A stale row
// gets refreshed by whoever notices, which is what
// /api/exchange-rates/refresh is for.
//
// The stored row stays the single source of truth. Nothing here converts
// anything; it only keeps that row fresh.

export type RefreshOutcome = {
  ok: boolean;
  /** Set when nothing was attempted. */
  skipped?: string;
  fetched?: { eur: number; gbp: number; hkd: number };
  updated: number;
  refused: { tenant: string; reason: string }[];
  error?: string;
};

type RateRow = {
  id: string;
  tenant_id: string;
  eur: number | string | null;
  gbp: number | string | null;
  hkd: number | string | null;
};

/* eslint-disable @typescript-eslint/no-explicit-any */
type Admin = SupabaseClient<any, "public", any>;

/**
 * Fetch the market once and write it to every active row that accepts it.
 *
 * Needs a SERVICE-ROLE client: `exchange_rates` carries no customer UPDATE
 * policy, and it must not.
 */
export async function refreshExchangeRates(
  supabase: Admin,
): Promise<RefreshOutcome> {
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
    // ── A REFRESH THAT STOPS MUST NOT BE INVISIBLE ─────────────────
    //
    // This returned a 502 and said nothing to anybody. The whole reason
    // it exists is that a rate quietly went ten days stale; a provider
    // that starts refusing would put us straight back there, with the app
    // happily converting on an old number. So: tell the owner, on every
    // tenant, and keep the old rate.
    console.error("exchange-rates: provider", safeErrorMessage(e));
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
            "The rate update could not reach the provider. The previous rate is still in use — check how old it is on Settings → Finance.",
        });
      }
    } catch (inner) {
      console.error("exchange-rates: alert", safeErrorMessage(inner));
    }
    return {
      ok: false,
      updated: 0,
      refused: [],
      error: "Could not reach the rate provider",
    };
  }

  const { data: rows, error } = await supabase
    .from("exchange_rates")
    .select("id, tenant_id, eur, gbp, hkd")
    .eq("is_active", true);
  if (error) {
    console.error("exchange-rates: read", safeErrorMessage(error));
    return {
      ok: false,
      updated: 0,
      refused: [],
      error: "Could not read the stored rates",
    };
  }

  const updated: string[] = [];
  const refused: { tenant: string; reason: string }[] = [];

  for (const row of (rows ?? []) as RateRow[]) {
    // ── THE BAND, PER CURRENCY ─────────────────────────────────────
    //
    // All three have to pass or none is written. A row where EUR moved
    // sensibly and HKD did something absurd is a bad response, not a
    // partially good one — and half a rate row is worse than a stale one,
    // because nothing downstream would know.
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
      // The owner has to hear about this — a rate that stopped updating is
      // invisible otherwise, which is exactly how it got to ten days old.
      // Best effort: a failed alert must not stop the other tenants being
      // updated.
      try {
        await supabase.rpc("raise_integration_failure", {
          p_tenant_id: row.tenant_id,
          p_source: "exchange_rate",
          p_detail: `Rate not updated: ${reason}. The previous rate is still in use.`,
        });
      } catch (e) {
        console.error("exchange-rates: alert", safeErrorMessage(e));
      }
      continue;
    }

    const { error: writeErr } = await supabase
      .from("exchange_rates")
      .update({ eur: fresh.eur, gbp: fresh.gbp, hkd: fresh.hkd })
      .eq("id", row.id);
    if (writeErr) {
      console.error("exchange-rates: write", safeErrorMessage(writeErr));
      refused.push({ tenant: row.tenant_id, reason: "write failed" });
      continue;
    }
    updated.push(row.tenant_id);
  }

  return { ok: true, fetched: fresh, updated: updated.length, refused };
}
