"use server";

import { ensureInitialAdAccountTypes } from "@/actions/ad-account-type-actions";
import { ensureInitialExchangeRates } from "@/actions/exchange-rate-actions";
import { ensureInitialFeeDefaults } from "@/actions/fee-default-actions";

/**
 * One call for the three "seed a fresh tenant" actions.
 *
 * The provider used to fire all three separately on every page load. They
 * looked parallel — three un-awaited calls — but Next.js serialises server
 * actions per client, so they ran one after another: measured on production,
 * three POSTs to /dashboard at 1.19s, 1.29s and 1.34s, back to back, adding
 * ~3.8 seconds to every cold load. Every one of those seconds was spent
 * re-confirming a seed that only ever does anything on a brand-new tenant.
 *
 * Two changes, together: they now share ONE round trip, and inside it they
 * genuinely run in parallel. The caller also only invokes this once per
 * browser session — see context/app-provider.tsx.
 *
 * Each seeder keeps its own admin + tenant guard; this adds no authority of
 * its own. Failures are reported per seed rather than thrown, because a
 * missing exchange rate must not stop the ad-account types being created.
 */
export async function ensureTenantBootstrap(): Promise<{
  exchangeRates: boolean;
  feeDefaults: boolean;
  adAccountTypes: boolean;
}> {
  const [rates, fees, types] = await Promise.allSettled([
    ensureInitialExchangeRates(),
    ensureInitialFeeDefaults(),
    ensureInitialAdAccountTypes(),
  ]);

  const ok = (r: PromiseSettledResult<{ ok: boolean }>) =>
    r.status === "fulfilled" && r.value.ok;

  return {
    exchangeRates: ok(rates),
    feeDefaults: ok(fees),
    adAccountTypes: ok(types),
  };
}
