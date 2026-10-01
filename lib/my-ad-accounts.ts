// ── DE AD ACCOUNTS ZOALS DE KLANT ZE LEEST ──────────────────────────
//
// Plak 192 (lekcontrole 01-10, L1): de klant leest ad_accounts niet meer
// rechtstreeks -- `platform` daar IS het interne type (hk-meta-premium,
// eu-meta-psm-gh). In plaats daarvan de view my_ad_accounts: dezelfde
// rijen, zonder platform/notes/metadata, met `network` (meta/google/tiktok)
// en `bank_group` (turlit/zanel).
//
// Elke klantlees vraagt eerst de view. Bestaat die nog niet (plak niet
// geplakt), dan de oude weg -- het scherm breekt niet in de tussentijd.
// Een rij uit de view krijgt platform = network, zodat de bestaande
// schermcode (icoon, "Meta") gewoon blijft werken.

import type { SupabaseClient } from "@supabase/supabase-js";

export const MY_AD_ACCOUNT_COLUMNS =
  "id, name, bm_id, fee, advertiser_id, start_date, updated_at, payment_status, status, tenant_id, timezone, website_url, created_at, min_topup, currency, network, bank_group";

/** De view bestaat (nog) niet: dan valt de lees terug. */
export function viewMissing(e: { message?: string; code?: string } | null | undefined): boolean {
  if (!e) return false;
  return (
    e.code === "PGRST205" ||
    e.code === "42P01" ||
    /my_ad_accounts|schema cache|does not exist|could not find/i.test(String(e.message ?? ""))
  );
}

/** Een rij uit de view, met platform = network. */
export function fromView<T extends Record<string, unknown>>(row: T): T & { platform: string | null } {
  return { ...row, platform: (row.network as string | null) ?? null };
}

type Filter = { column: "advertiser_id" | "id" | "tenant_id"; value: string };

/**
 * Lees de eigen ad accounts via de view, of -- zonder plak 192 -- via de
 * tabel met de oude kolommen. `single` voor een lees op id.
 */
export async function readMyAdAccounts(
  supabase: SupabaseClient,
  filter: Filter,
  fallbackColumns: string,
): Promise<{ data: Record<string, unknown>[]; error: { message?: string } | null }> {
  const v = await supabase.from("my_ad_accounts").select(MY_AD_ACCOUNT_COLUMNS).eq(filter.column, filter.value);
  if (!v.error) {
    return { data: ((v.data ?? []) as Record<string, unknown>[]).map(fromView), error: null };
  }
  if (!viewMissing(v.error)) return { data: [], error: v.error };
  const t = await supabase.from("ad_accounts").select(fallbackColumns).eq(filter.column, filter.value);
  return { data: (t.data ?? []) as unknown as Record<string, unknown>[], error: t.error };
}
