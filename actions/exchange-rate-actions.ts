"use server";

import { getExchangeRate } from "@/lib/get-exchange-rates";
import { createClient } from "@/lib/supabase/server";
import { formatRate } from "@/lib/utils";
import { cookies } from "next/headers";
import { maintenanceGuard } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdminCtx() {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false as const, error: mm.error };
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  return { ok: true as const, supabase, profile };
}

// Sanity bounds — reject 3rd-party API responses that look garbage.
function isSaneRate(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0 && v < 1000;
}

// ─────────────────────────────────────────
// ensureInitialExchangeRates
//
// Called once per admin session load. If no active rate exists for the
// tenant, fetch USD rates from the 3rd-party API, validate, and insert.
// Server-side so the anon key never touches exchange_rates.
// ─────────────────────────────────────────
export async function ensureInitialExchangeRates(): Promise<
  ActionResult<{ created: boolean }>
> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: existing } = await supabase
    .from("exchange_rates")
    .select("id")
    .eq("tenant_id", profile.tenant_id)
    .eq("is_active", true)
    .maybeSingle();
  if (existing) return { ok: true, data: { created: false } };

  let usdRates;
  try {
    usdRates = await getExchangeRate("USD");
  } catch (err) {
    return {
      ok: false,
      error: `Exchange rate provider unavailable: ${
        err instanceof Error ? err.message : "unknown"
      }`,
    };
  }
  const eur = Number(formatRate(usdRates?.usd?.eur));
  const gbp = Number(formatRate(usdRates?.usd?.gbp));
  const hkd = Number(formatRate(usdRates?.usd?.hkd));
  if (!isSaneRate(eur) || !isSaneRate(gbp) || !isSaneRate(hkd)) {
    return { ok: false, error: "Exchange rate response failed validation" };
  }

  const { error } = await supabase.from("exchange_rates").upsert({
    currency: "USD",
    eur,
    gbp,
    hkd,
    is_active: true,
    tenant_id: profile.tenant_id,
    updated_by: profile.user_id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: { created: true } };
}

// ─────────────────────────────────────────
// upsertExchangeRate — admin edit from settings UI
// ─────────────────────────────────────────
type UpsertRateInput = {
  currency: string;
  eur: number;
  gbp: number;
  hkd: number;
  is_active?: boolean;
};

export async function upsertExchangeRate(
  input: UpsertRateInput,
): Promise<ActionResult> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const currency = String(input?.currency ?? "").toUpperCase();
  if (!["USD", "EUR", "GBP", "HKD"].includes(currency)) {
    return { ok: false, error: "Unsupported currency" };
  }
  if (
    !isSaneRate(input.eur) ||
    !isSaneRate(input.gbp) ||
    !isSaneRate(input.hkd)
  ) {
    return { ok: false, error: "Rate values out of range" };
  }

  const { error } = await supabase.from("exchange_rates").upsert({
    currency,
    eur: input.eur,
    gbp: input.gbp,
    hkd: input.hkd,
    is_active: input.is_active ?? true,
    tenant_id: profile.tenant_id,
    updated_by: profile.user_id,
    updated_at: new Date().toISOString(),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
