"use server";

import {
  FEE_DEFAULT_FALLBACK_PCT,
  FEE_DEFAULT_SEED,
  type FeeDefault,
  type FeeDefaultCurrency,
  type FeeDefaultPlatform,
} from "@/lib/types/fee-default";
import { type ActionResult, resolveAdminContext } from "./_shared";

// ─────────────────────────────────────────
// listFeeDefaults
// Read all fee_defaults rows for the caller's tenant. Admin-only.
// ─────────────────────────────────────────
export async function listFeeDefaults(): Promise<ActionResult<FeeDefault[]>> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { data, error } = await supabase
    .from("fee_defaults")
    .select(
      "id, tenant_id, platform, currency, fee_pct, is_active, updated_by, created_at, updated_at",
    )
    .eq("tenant_id", profile.tenant_id)
    .order("platform", { ascending: true })
    .order("currency", { ascending: true });
  if (error) return { ok: false, error: error.message };

  return { ok: true, data: (data ?? []) as FeeDefault[] };
}

// ─────────────────────────────────────────
// ensureInitialFeeDefaults
// Fires from the app-provider mount. Idempotent — if the tenant
// already has any fee_defaults row, does nothing. Otherwise inserts
// the seed set from lib/types/fee-default.ts.
// ─────────────────────────────────────────
export async function ensureInitialFeeDefaults(): Promise<
  ActionResult<{ created: number }>
> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const { count, error: countError } = await supabase
    .from("fee_defaults")
    .select("id", { count: "exact", head: true })
    .eq("tenant_id", profile.tenant_id);
  if (countError) return { ok: false, error: countError.message };
  if ((count ?? 0) > 0) return { ok: true, data: { created: 0 } };

  const rows = FEE_DEFAULT_SEED.map((s) => ({
    ...s,
    tenant_id: profile.tenant_id,
    is_active: true,
    updated_by: profile.user_id,
  }));
  const { error } = await supabase.from("fee_defaults").insert(rows);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { created: rows.length } };
}

// ─────────────────────────────────────────
// upsertFeeDefault
// Admin edit from Finance settings. Column-allowlisted; tenant_id
// forced from the session.
// ─────────────────────────────────────────
const ALLOWED_PLATFORMS: FeeDefaultPlatform[] = [
  "meta-ads",
  "tiktok-ads",
  "google-ads",
];
const ALLOWED_CURRENCIES: FeeDefaultCurrency[] = ["USD", "EUR"];

function isValidPct(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
}

export async function upsertFeeDefault(input: {
  platform: string;
  currency: string;
  fee_pct: number;
  is_active?: boolean;
}): Promise<ActionResult> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const platform = String(input?.platform ?? "") as FeeDefaultPlatform;
  const currency = String(input?.currency ?? "").toUpperCase() as FeeDefaultCurrency;

  if (!ALLOWED_PLATFORMS.includes(platform)) {
    return { ok: false, error: "Unsupported platform" };
  }
  if (!ALLOWED_CURRENCIES.includes(currency)) {
    return { ok: false, error: "Unsupported currency" };
  }
  if (!isValidPct(input.fee_pct)) {
    return { ok: false, error: "fee_pct must be a fraction between 0 and 1" };
  }

  const { error } = await supabase
    .from("fee_defaults")
    .upsert(
      {
        tenant_id: profile.tenant_id,
        platform,
        currency,
        fee_pct: input.fee_pct,
        is_active: input.is_active ?? true,
        updated_by: profile.user_id,
      },
      { onConflict: "tenant_id,platform,currency" },
    );
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// resolveFeePct
// Called at topup-creation time. Priority:
//   1. Advertiser row's custom_fee_pct (future column) — TODO once
//      the advertiser override field lands.
//   2. fee_defaults active row for (platform, currency)
//   3. FEE_DEFAULT_FALLBACK_PCT
// Never throws — always returns a number so a topup can proceed.
// ─────────────────────────────────────────
export async function resolveFeePct(input: {
  platform: string;
  currency: string;
}): Promise<number> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return FEE_DEFAULT_FALLBACK_PCT;
  const { supabase, profile } = auth.ctx;

  const platform = String(input?.platform ?? "");
  const currency = String(input?.currency ?? "").toUpperCase();

  const { data } = await supabase
    .from("fee_defaults")
    .select("fee_pct")
    .eq("tenant_id", profile.tenant_id)
    .eq("platform", platform)
    .eq("currency", currency)
    .eq("is_active", true)
    .maybeSingle();

  const pct = Number(data?.fee_pct);
  if (Number.isFinite(pct) && pct >= 0 && pct <= 1) return pct;
  return FEE_DEFAULT_FALLBACK_PCT;
}
