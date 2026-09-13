"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maintenanceGuard, type ActionResult } from "./_shared";
import { getSupplier1Adapter } from "@/lib/integrations/supplier1";
import { safeErrorMessage } from "@/lib/pure-error";
import type { SupplierAdAccount } from "@/lib/types/supplier-ad-account";

// Admin context: maintenance guard + admin role + tenant, mirroring the other
// admin actions (multi-profile users are disambiguated by the profile_id
// cookie, and a deactivated admin loses access).
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
    .select("id, role, tenant_id, user_id, is_active, status")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };
  const profile = existingProfile
    ? (profiles.find((p) => p.id === existingProfile) ?? profiles[0])
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false as const, error: "Account is inactive" };
  }
  return { ok: true as const, supabase, profile };
}

// ─────────────────────────────────────────
// listSupplierAdAccounts — read the pool
// ─────────────────────────────────────────
export async function listSupplierAdAccounts(): Promise<
  ActionResult<SupplierAdAccount[]>
> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const { data, error } = await supabase
    .from("supplier_ad_accounts")
    .select("*")
    .eq("tenant_id", profile.tenant_id)
    .order("advertiser_id", { ascending: true, nullsFirst: true })
    .order("synced_at", { ascending: false })
    .limit(1000);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as SupplierAdAccount[] };
}

// ─────────────────────────────────────────
// syncSupplierAdAccounts — pull the supplier's ad accounts into the pool
// ─────────────────────────────────────────
// Upserts on (tenant_id, provider, external_id) so re-syncing refreshes the
// mirrored fields and NEVER clobbers an existing allocation (advertiser_id /
// ad_account_id / assigned_at are simply not part of the upsert payload).
export async function syncSupplierAdAccounts(): Promise<
  ActionResult<{ fetched: number; upserted: number }>
> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const adapter = getSupplier1Adapter();
  const res = await adapter.listAdAccounts();
  if (!res.ok) {
    return { ok: false, error: `Supplier sync failed: ${res.error}` };
  }

  const accounts = res.data ?? [];
  if (accounts.length === 0) {
    return { ok: true, data: { fetched: 0, upserted: 0 } };
  }

  const nowIso = new Date().toISOString();
  const rows = accounts.map((a) => ({
    tenant_id: profile.tenant_id,
    provider: "supplier1",
    external_id: a.external_id,
    name: a.name ?? null,
    bm_id: a.bm_id ?? null,
    platform: a.platform ?? null,
    currency: a.currency ?? null,
    timezone: a.timezone ?? null,
    status: a.status ?? null,
    fee_percentage: a.fee_percentage ?? null,
    balance_cents: a.balance_cents ?? null,
    supplier_assigned_to: a.assigned_to ?? null,
    raw: a as unknown as Record<string, unknown>,
    synced_at: nowIso,
  }));

  const { error } = await supabase
    .from("supplier_ad_accounts")
    .upsert(rows, { onConflict: "tenant_id,provider,external_id" });
  if (error) {
    console.error("supplier pool upsert failed:", safeErrorMessage(error));
    return { ok: false, error: error.message };
  }

  return { ok: true, data: { fetched: accounts.length, upserted: rows.length } };
}

// ─────────────────────────────────────────
// addManualPoolAccount — put an ad account WE hold into the pool
// ─────────────────────────────────────────
// The pool is "all allocatable inventory", not just the supplier's. Manual
// rows carry provider='manual' so syncSupplierAdAccounts (which upserts on
// (tenant, provider='supplier1', external_id)) never touches or overwrites
// them.
export async function addManualPoolAccount(input: {
  name: string;
  externalId?: string;
  platform?: string;
  currency?: string;
  timezone?: string;
  bmId?: string;
  feePercentage?: number;
  notes?: string;
}): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const name = (input?.name ?? "").trim();
  if (!name) return { ok: false, error: "Name is required", code: "invalid" };

  const fee = input.feePercentage != null ? Number(input.feePercentage) : null;
  if (fee != null && (!Number.isFinite(fee) || fee < 0 || fee > 100)) {
    return { ok: false, error: "Fee must be between 0 and 100", code: "invalid" };
  }

  // A manual account still needs a stable identifier for the uniqueness
  // constraint — use the operator's own id (BM/account id) when given.
  const externalId =
    (input.externalId ?? "").trim() || `manual-${crypto.randomUUID().slice(0, 8)}`;

  const { data, error } = await supabase
    .from("supplier_ad_accounts")
    .insert({
      tenant_id: profile.tenant_id,
      provider: "manual",
      external_id: externalId,
      name,
      bm_id: (input.bmId ?? "").trim() || null,
      platform: (input.platform ?? "").trim() || null,
      currency: (input.currency ?? "").trim().toUpperCase() || null,
      timezone: (input.timezone ?? "").trim() || null,
      status: "active",
      fee_percentage: fee,
      notes: (input.notes ?? "").trim() || null,
      synced_at: new Date().toISOString(),
    })
    .select("id")
    .single();
  if (error) {
    const dup = /duplicate|unique/i.test(error.message)
      ? "An account with that identifier is already in the pool."
      : error.message;
    return { ok: false, error: dup };
  }
  return { ok: true, data: { id: data.id } };
}

// ─────────────────────────────────────────
// assignSupplierAdAccount — allocate a pooled account to an advertiser
// ─────────────────────────────────────────
// Creates the real public.ad_accounts row the advertiser will see, then stamps
// the allocation onto the pool row. The supplier's external id is carried in
// ad_accounts.metadata so top-up/withdraw pushes can address it later.
export async function assignSupplierAdAccount(input: {
  poolId: string;
  advertiserId: string;
  fee?: number;
  name?: string;
}): Promise<ActionResult<{ ad_account_id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  if (typeof input?.poolId !== "string" || !input.poolId) {
    return { ok: false, error: "poolId required", code: "invalid" };
  }
  if (typeof input?.advertiserId !== "string" || !input.advertiserId) {
    return { ok: false, error: "advertiserId required", code: "invalid" };
  }

  // Pool row must exist, belong to this tenant, and still be unallocated.
  const { data: pool } = await supabase
    .from("supplier_ad_accounts")
    .select(
      "id, tenant_id, provider, external_id, name, platform, currency, timezone, fee_percentage, advertiser_id",
    )
    .eq("id", input.poolId)
    .maybeSingle();
  if (!pool) return { ok: false, error: "Pool account not found", code: "not_found" };
  if (pool.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (pool.advertiser_id) {
    return {
      ok: false,
      error: "This ad account is already allocated to an advertiser.",
      code: "conflict",
    };
  }

  // Advertiser must be in the same tenant.
  const { data: adv } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", input.advertiserId)
    .maybeSingle();
  if (!adv) return { ok: false, error: "Advertiser not found", code: "not_found" };
  if (adv.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }

  const fee = input.fee != null ? Number(input.fee) : Number(pool.fee_percentage ?? 0);
  if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
    return { ok: false, error: "Fee must be between 0 and 100", code: "invalid" };
  }

  const { data: created, error: createError } = await supabase
    .from("ad_accounts")
    .insert({
      name: input.name?.trim() || pool.name || `Account ${pool.external_id}`,
      advertiser_id: input.advertiserId,
      tenant_id: profile.tenant_id,
      platform: pool.platform,
      currency: pool.currency,
      timezone: pool.timezone,
      fee,
      created_by: profile.id,
      metadata: {
        // 'supplier1' rows can be addressed on the supplier API by this id;
        // 'manual' rows are ours and carry it for reference only.
        source: pool.provider,
        supplier_external_id: pool.external_id,
        allocated_from_pool_id: pool.id,
      },
    })
    .select("id")
    .single();
  if (createError || !created) {
    console.error("pool allocate insert failed:", safeErrorMessage(createError));
    return { ok: false, error: createError?.message ?? "Could not create ad account" };
  }

  // Stamp the allocation. Guarded on advertiser_id IS NULL so two admins
  // allocating the same pooled account at once can't both win.
  const { data: claimed, error: claimError } = await supabase
    .from("supplier_ad_accounts")
    .update({
      ad_account_id: created.id,
      advertiser_id: input.advertiserId,
      assigned_at: new Date().toISOString(),
      assigned_by: profile.id,
    })
    .eq("id", pool.id)
    .eq("tenant_id", profile.tenant_id)
    .is("advertiser_id", null)
    .select("id");
  if (claimError) return { ok: false, error: claimError.message };
  if (!claimed || claimed.length === 0) {
    return {
      ok: false,
      error: "Someone else just allocated this ad account. Reload and retry.",
      code: "conflict",
    };
  }

  return { ok: true, data: { ad_account_id: created.id } };
}

// ─────────────────────────────────────────
// releaseSupplierAdAccount — put an allocated account back in the pool
// ─────────────────────────────────────────
// Clears the allocation stamp only. The advertiser's ad_accounts row is left
// alone on purpose (it may already carry spend/top-up history) — delete or
// reassign it deliberately from the Ad Accounts screen.
export async function releaseSupplierAdAccount(
  poolId: string,
): Promise<ActionResult> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const { data: pool } = await supabase
    .from("supplier_ad_accounts")
    .select("id, tenant_id")
    .eq("id", poolId)
    .maybeSingle();
  if (!pool) return { ok: false, error: "Pool account not found", code: "not_found" };
  if (pool.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }

  const { error } = await supabase
    .from("supplier_ad_accounts")
    .update({
      ad_account_id: null,
      advertiser_id: null,
      assigned_at: null,
      assigned_by: null,
    })
    .eq("id", poolId)
    .eq("tenant_id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}
