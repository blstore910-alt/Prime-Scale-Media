"use client";

import { useEffect } from "react";

import { createClient } from "@/lib/supabase/client";
import { useAppContext } from "@/context/app-provider";
import { useQuery } from "@tanstack/react-query";

/**
 * The tenant's active USD→EUR rate, for the few places that have to put two
 * currencies on one scale.
 *
 * It exists because the affiliate tier ladder was adding euros to dollars:
 *
 *     const lifetimeCombined = lifetimeEur + lifetimeUsd;
 *
 * and then printing the gap to the next tier with a euro sign. An affiliate
 * on $1,000 and €0 was shown a tier they had not reached and told "€1,500
 * more" — a euro sentence derived from a number that is not in euros.
 *
 * `exchange_rates` is readable by any profile in the tenant (policy
 * `exchange_rates_select`), so this is a direct read.
 *
 * WHEN THE RATE CANNOT BE READ it returns null rather than 1. A rate of 1
 * would be the same bug with a confident face on it — the caller has to
 * decide what to say when the two currencies cannot be compared, and this
 * hook must not decide it for them by guessing parity.
 */
// ── ONE ASK PER TAB, NOT ONE PER HOOK ───────────────────────────────
//
// Module scope on purpose. This hook is mounted by five components and
// more than one of them is on screen at once -- measured on production
// 27-09, the affiliate's Referrals screen fired the refresh TWICE per
// load, once from the shell and once from the payout card, and did it
// again on every navigation.
//
// A per-instance ref cannot see the other instance. This can.
const REASK_AFTER_MS = 5 * 60_000;
// De eigenaar, 01-10: "it should update every 15min". A row older than
// this is refreshed by whoever is looking, whatever the cron did.
const REFRESH_AFTER_MS = 15 * 60_000;
let lastAskedAt = 0;

export function useUsdToEur() {
  const { profile } = useAppContext();
  const tenantId = profile?.tenant_id ?? null;

  const { data, isError, isLoading, isPending, refetch } = useQuery({
    queryKey: ["usd-to-eur", tenantId],
    enabled: !!tenantId,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("exchange_rates")
        // updated_at as well, so the reader can tell a rate from a
        // MEMORY of a rate. See the effect below.
        .select("eur, updated_at")
        .eq("tenant_id", tenantId)
        .eq("is_active", true)
        .maybeSingle();
      if (error) throw error;
      const row = data as { eur?: number; updated_at?: string } | null;
      const eur = Number(row?.eur);
      return {
        eur: Number.isFinite(eur) && eur > 0 ? eur : null,
        updatedAt: row?.updated_at ?? null,
      };
    },
  });

  // ── A RATE THAT HAS GONE STALE ASKS FOR A NEW ONE ────────────────
  //
  // The hourly cron in vercel.json does not keep to its schedule.
  // Measured on production 27-09: one run at 08:00:26, then nothing at
  // 09, 10, 11, 12 or 13 — and no integration alert either, so it did not
  // run and fail, it did not run. By 13:31 the stored rate was 5,5 hours
  // old, and it is the figure behind the EUR 50 request fee, every wallet
  // exchange and every converted payout.
  //
  // This hook is on every screen that puts two currencies on one scale,
  // which makes it the thing that notices first. So it asks
  // /api/exchange-rates/refresh, which checks the age again server-side
  // and only then calls the provider.
  //
  // Deliberately quiet: no toast, no spinner, nothing blocked on it. The
  // screen keeps rendering the rate it has — a slightly old rate is worth
  // showing, and this is a background top-up, not a dependency. `asked`
  // holds it to once per mount so a re-render cannot loop.
  useEffect(() => {
    if (!tenantId || !data?.updatedAt) return;
    if (Date.now() - new Date(data.updatedAt).getTime() < REFRESH_AFTER_MS) return;
    // Stamped BEFORE the request, so two instances rendering in the same
    // tick cannot both get through, and a refresh that fails cannot be
    // retried on every re-render.
    if (Date.now() - lastAskedAt < REASK_AFTER_MS) return;
    lastAskedAt = Date.now();
    (async () => {
      try {
        const res = await fetch("/api/exchange-rates/refresh", {
          method: "POST",
        });
        // Only re-read when something was actually written. A "fresh" or a
        // provider failure changes nothing, and refetching on those would
        // be a second pointless read on every money screen.
        const body = (await res.json().catch(() => null)) as
          | { updated?: number }
          | null;
        if (res.ok && Number(body?.updated) > 0) await refetch();
      } catch {
        // The screen already has a rate and already says how old it is.
      }
    })();
  }, [tenantId, data?.updatedAt, refetch]);

  return {
    /** EUR per 1 USD, or null when it could not be read. */
    rate: data?.eur ?? null,
    /** When the stored row was last written, or null. */
    updatedAt: data?.updatedAt ?? null,
    isLoading,
    /** No answer yet -- including a query that never ran (no tenant id).
     *  Without it the caller states "there is no rate set today", which
     *  is a claim about the tenant's configuration derived from a
     *  question nobody asked. */
    isPending,
    isError,
  };
}

export default useUsdToEur;
