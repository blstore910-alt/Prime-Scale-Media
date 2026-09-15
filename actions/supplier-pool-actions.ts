"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { checkVersion, maintenanceGuard, type ActionResult } from "./_shared";
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

  // Explicit column list, not '*': the table carries a `raw` jsonb blob (the
  // whole supplier payload, kept for debugging) that the UI never reads.
  // Shipping it for up to 1000 rows inflated the payload several times over.
  const { data, error } = await supabase
    .from("supplier_ad_accounts")
    .select(
      "id, tenant_id, provider, external_id, name, bm_id, platform, currency, timezone, status, fee_percentage, balance_cents, supplier_assigned_to, ad_account_id, advertiser_id, assigned_at, assigned_by, notes, synced_at, created_at, updated_at",
    )
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

  // De-duplicate on external_id BEFORE writing. supabase-js sends an upsert as
  // one INSERT … ON CONFLICT DO UPDATE, and Postgres aborts the whole
  // statement with 21000 ("cannot affect row a second time") if the payload
  // names the same conflict key twice — so one duplicated row from the
  // supplier's pagination would discard every good row with it. The adapter
  // pages until page >= total_pages with no de-dup of its own, so drift from a
  // supplier-side insert mid-sync is enough to trigger it. Last write wins.
  const byExternalId = new Map<string, Record<string, unknown>>();
  for (const a of accounts) {
    if (!a.external_id) continue;
    byExternalId.set(a.external_id, {
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
    });
  }
  const rows = [...byExternalId.values()];

  // Chunked so a large inventory doesn't become one oversized statement.
  const CHUNK = 500;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const { error } = await supabase
      .from("supplier_ad_accounts")
      .upsert(rows.slice(i, i + CHUNK), {
        onConflict: "tenant_id,provider,external_id",
      });
    if (error) {
      console.error("supplier pool upsert failed:", safeErrorMessage(error));
      return { ok: false, error: error.message };
    }
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
  /** What WE pay the supplier. Defaults to the supplier's own reported fee. */
  supplierFeePct?: number | null;
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
      "id, tenant_id, provider, external_id, name, bm_id, platform, currency, timezone, fee_percentage, advertiser_id",
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

  // The fee is what PSM earns on every future top-up on this account, so an
  // ambiguous fee is refused rather than defaulted. Falling back to 0 when the
  // pool row had no supplier fee (a manual row added with the field blank, or
  // a synced row whose fee came back null — both shown as "—" in the table)
  // silently created an account PSM earns nothing on, while the modal's label
  // promised "defaults to the supplier's".
  if (input.fee == null && pool.fee_percentage == null) {
    return {
      ok: false,
      error:
        "This account has no supplier fee — enter the fee to charge on top-ups.",
      code: "invalid",
    };
  }
  const fee = input.fee != null ? Number(input.fee) : Number(pool.fee_percentage);
  if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
    return { ok: false, error: "Fee must be between 0 and 100", code: "invalid" };
  }

  // What WE pay the supplier. Seeded from the supplier's own reported figure
  // so the common case needs no typing, but stored on the ad account rather
  // than read from the pool row at display time — the pool row is a mirror
  // that every sync overwrites, and it can be released while the advertiser's
  // account lives on. NULL stays NULL: "not recorded" is not "they charge us
  // nothing", and a 0 default would make every account claim full margin.
  const supplierFeeRaw =
    input.supplierFeePct !== undefined
      ? input.supplierFeePct
      : pool.fee_percentage;
  let supplierFeePct: number | null = null;
  if (supplierFeeRaw != null && supplierFeeRaw !== "") {
    supplierFeePct = Number(supplierFeeRaw);
    if (!Number.isFinite(supplierFeePct) || supplierFeePct < 0 || supplierFeePct > 100) {
      return {
        ok: false,
        error: "Supplier fee must be between 0 and 100",
        code: "invalid",
      };
    }
  }

  // CLAIM FIRST, then create. The order matters: these are two separate
  // writes, and the claim is the only point of mutual exclusion. Creating the
  // ad_accounts row first meant the admin who LOST the race — or any failure
  // on the second statement — left a real, advertiser-visible ad account
  // behind that no pool row referenced, while being told the allocation
  // failed. Claiming first means a lost race costs nothing, and the only
  // failure left to compensate for (the insert) is one we can undo.
  const { data: claimed, error: claimError } = await supabase
    .from("supplier_ad_accounts")
    .update({
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

  const { data: created, error: createError } = await supabase
    .from("ad_accounts")
    .insert({
      name: input.name?.trim() || pool.name || `Account ${pool.external_id}`,
      advertiser_id: input.advertiserId,
      tenant_id: profile.tenant_id,
      bm_id: pool.bm_id,
      platform: pool.platform,
      currency: pool.currency,
      timezone: pool.timezone,
      // Non-nullable in lib/types/account.ts and required by the ad-account
      // form; the sibling createAdAccountAsAdmin defaults it the same way.
      start_date: new Date().toISOString(),
      fee,
      created_by: profile.user_id,
      // NOTHING about the supplier goes on this row. The advertiser reads
      // their own ad_accounts through RLS with select("*"), so anything put
      // here is delivered to the customer's browser — and the supplier must
      // never be visible to a customer under any name. The provenance is
      // recorded below in the admin-only cost table instead.
    })
    .select("id")
    .single();

  if (createError || !created) {
    // Release the claim so the account goes back in the pool instead of being
    // stuck allocated-to-nothing.
    await supabase
      .from("supplier_ad_accounts")
      .update({
        advertiser_id: null,
        assigned_at: null,
        assigned_by: null,
      })
      .eq("id", pool.id)
      .eq("tenant_id", profile.tenant_id);
    console.error("pool allocate insert failed:", safeErrorMessage(createError));
    return { ok: false, error: createError?.message ?? "Could not create ad account" };
  }

  // Link the two. Best-effort: the allocation itself already holds, and
  // leaving ad_account_id unset only affects the auto-push lookup, which is
  // recoverable by re-allocating.
  const { error: linkError } = await supabase
    .from("supplier_ad_accounts")
    .update({ ad_account_id: created.id })
    .eq("id", pool.id)
    .eq("tenant_id", profile.tenant_id);
  if (linkError) {
    console.error("pool link failed:", safeErrorMessage(linkError));
  }

  // What WE pay AND where the account came from both go in the admin-only
  // cost table, never on the ad_accounts row — an advertiser can read their
  // own ad_accounts through RLS.
  let warning: string | undefined;
  const { error: costError } = await supabase.from("ad_account_costs").upsert(
    {
      ad_account_id: created.id,
      tenant_id: profile.tenant_id,
      ...(supplierFeePct != null ? { supplier_fee_pct: supplierFeePct } : {}),
      supplier_source: pool.provider,
      supplier_external_id: pool.external_id,
      pool_id: pool.id,
    },
    { onConflict: "ad_account_id" },
  );
  if (costError) {
    console.error("cost row failed:", safeErrorMessage(costError));
    // Say which half failed — a missing fee costs us margin reporting, a
    // missing link costs us the provenance trail. Neither undoes the
    // allocation, which already holds.
    warning = `Allocated, but the supplier fee and provenance were not saved: ${costError.message}`;
  }

  return { ok: true, data: { ad_account_id: created.id }, warning };
}

// ─────────────────────────────────────────
// releaseSupplierAdAccount — put an allocated account back in the pool
// ─────────────────────────────────────────
// Clears the allocation stamp. REFUSES while the advertiser's ad_accounts row
// is still active, because releasing does real damage in that state: the
// auto-push path resolves the supplier's id by looking the pool row up on
// ad_account_id (lib/integrations/enqueue.ts), so nulling it makes every
// future top-up on that live account fall through to "not supplier-managed"
// and stop being pushed — silently. Worse, the pool row could then be
// allocated to a SECOND advertiser with no warning on either screen.
export async function releaseSupplierAdAccount(
  poolId: string,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const { data: pool } = await supabase
    .from("supplier_ad_accounts")
    .select("id, tenant_id, ad_account_id, advertiser_id")
    .eq("id", poolId)
    .maybeSingle();
  if (!pool) return { ok: false, error: "Pool account not found", code: "not_found" };
  if (pool.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }

  // Optimistic concurrency (CLAUDE.md mutation rule 4) — the pool list has a
  // 30s staleTime, so acting on a stale row is routine.
  const fresh = await checkVersion(
    supabase,
    "supplier_ad_accounts",
    poolId,
    ifUpdatedAt,
  );
  if (!fresh) {
    return {
      ok: false,
      error: "This pool account changed since you loaded it. Reload and retry.",
      code: "conflict",
    };
  }

  if (pool.ad_account_id) {
    const { data: acct } = await supabase
      .from("ad_accounts")
      .select("id, name, status")
      .eq("id", pool.ad_account_id)
      .maybeSingle();
    if (acct && (acct.status ?? "active") !== "inactive") {
      return {
        ok: false,
        error: `"${acct.name ?? "The linked ad account"}" is still active. Deactivate or reassign it on the Ad Accounts screen first — releasing now would stop its top-ups reaching the supplier.`,
        code: "conflict",
      };
    }
  }

  // Guarded on the advertiser we read, so a concurrent re-allocation isn't
  // wiped by a stale release.
  const query = supabase
    .from("supplier_ad_accounts")
    .update({
      ad_account_id: null,
      advertiser_id: null,
      assigned_at: null,
      assigned_by: null,
    })
    .eq("id", poolId)
    .eq("tenant_id", profile.tenant_id);
  const { data: releasedRows, error } = await (pool.advertiser_id
    ? query.eq("advertiser_id", pool.advertiser_id)
    : query
  ).select("id");
  if (error) return { ok: false, error: error.message };
  if (pool.advertiser_id && (!releasedRows || releasedRows.length === 0)) {
    return {
      ok: false,
      error: "This ad account was just re-allocated. Reload and retry.",
      code: "conflict",
    };
  }
  return { ok: true, data: null };
}
