"use server";

import { createClient } from "@/lib/supabase/server";
import { wroteSomething } from "./_shared";
import { safeErrorMessage } from "@/lib/pure-error";
import { cookies } from "next/headers";
import {
  checkVersion,
  maintenanceGuard,
  versionMatches,
  type ActionResult,
} from "./_shared";
import type { SupabaseClient } from "@supabase/supabase-js";

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
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  // Deactivated admin keeps role but loses access.
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false as const, error: "Account is inactive" };
  }
  return { ok: true as const, supabase, profile };
}

// ─────────────────────────────────────────
// ad_accounts: create
// ─────────────────────────────────────────
// The supplier fee is what WE pay — a cost figure that must NEVER reach a
// customer. It lives in public.ad_account_costs, not on the ad_accounts row,
// precisely because advertisers can read their own ad_accounts through RLS and
// the advertiser app reads them with select("*"). Keeping it off that row
// makes the leak structurally impossible instead of dependent on every future
// query being written carefully.
//
// Read is admin-of-tenant (RLS). Write is the tenant owner only: a regular
// admin editing an ad account must not be able to move our margin, and hiding
// the field in the UI is not a boundary since a server action is directly
// invokable.
//
// `raw === undefined` means "not supplied" → leave untouched, so every
// existing caller keeps working. `null` or "" means "not recorded" and clears
// it — deliberately distinct from 0, which would claim the supplier charges
// us nothing.
async function upsertSupplierFee(
  supabase: SupabaseClient,
  profile: { user_id: string; tenant_id: string },
  adAccountId: string,
  raw: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (raw === undefined) return { ok: true };

  let pct: number | null = null;
  if (raw !== null && raw !== "") {
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return { ok: false, error: "Supplier fee must be between 0 and 100" };
    }
    pct = n;
  }

  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.owner_id !== profile.user_id) {
    return {
      ok: false,
      error: "Only the super-admin can set the supplier fee",
    };
  }

  const { error } = await supabase.from("ad_account_costs").upsert(
    {
      ad_account_id: adAccountId,
      tenant_id: profile.tenant_id,
      supplier_fee_pct: pct,
    },
    { onConflict: "ad_account_id" },
  );
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Admin-only read of the cost figures, keyed by ad account id. Separate from
// the ad-account read on purpose — a caller has to ask for costs explicitly,
// so no customer-facing query picks them up by accident.
export async function getAdAccountCosts(): Promise<
  ActionResult<Record<string, number | null>>
> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const { data, error } = await supabase
    .from("ad_account_costs")
    .select("ad_account_id, supplier_fee_pct")
    .eq("tenant_id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };

  const out: Record<string, number | null> = {};
  for (const row of (data ?? []) as Array<{
    ad_account_id: string;
    supplier_fee_pct: number | null;
  }>) {
    out[row.ad_account_id] =
      row.supplier_fee_pct == null ? null : Number(row.supplier_fee_pct);
  }
  return { ok: true, data: out };
}

const AD_ACCOUNT_INSERT_ALLOWED = [
  "name",
  "bm_id",
  "fee",
  "advertiser_id",
  "platform",
  "airtable",
  "timezone",
  "notes",
  "website_url",
  "metadata",
  "currency",
  "start_date",
] as const;
type AdAccountInsertInput = Partial<
  Record<(typeof AD_ACCOUNT_INSERT_ALLOWED)[number], unknown>
>;

export async function createAdAccountAsAdmin(
  input: AdAccountInsertInput & { supplier_fee_pct?: unknown },
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const advertiserId = input.advertiser_id;
  if (typeof advertiserId !== "string" || advertiserId.length === 0) {
    return { ok: false, error: "advertiser_id required" };
  }
  const { data: adv } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", advertiserId)
    .maybeSingle();
  if (!adv) return { ok: false, error: "Advertiser not found" };
  if (adv.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const feeRaw = input.fee;
  if (feeRaw != null) {
    const fee = Number(feeRaw);
    if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
      return { ok: false, error: "Fee must be between 0 and 100" };
    }
  }
  const cleaned: Record<string, unknown> = {};
  for (const col of AD_ACCOUNT_INSERT_ALLOWED) {
    if (col in input) cleaned[col] = input[col];
  }
  cleaned.tenant_id = profile.tenant_id;
  cleaned.created_by = profile.user_id;
  if (cleaned.start_date == null) {
    cleaned.start_date = new Date().toISOString();
  }

  const { data: inserted, error: insertError } = await supabase
    .from("ad_accounts")
    .insert(cleaned)
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  // Cost row is written after the account exists, and only when supplied.
  // A refusal here is reported but does not undo the account — the account
  // is the customer-facing thing and is already correct; the fee can be set
  // afterwards by the owner.
  const feeRes = await upsertSupplierFee(
    supabase,
    profile,
    inserted.id,
    input.supplier_fee_pct,
  );
  if (!feeRes.ok) {
    return {
      ok: true,
      data: { id: inserted.id },
      warning: `Ad account created, but the supplier fee was not saved: ${feeRes.error}`,
    };
  }

  return { ok: true, data: { id: inserted.id } };
}

// ─────────────────────────────────────────
// ad_accounts: update
// ─────────────────────────────────────────
const AD_ACCOUNT_UPDATE_ALLOWED = [
  "name",
  "bm_id",
  "fee",
  "airtable",
  "timezone",
  "notes",
  "website_url",
  "metadata",
  "min_topup",
  "status",
] as const;
type AdAccountUpdateInput = Partial<
  Record<(typeof AD_ACCOUNT_UPDATE_ALLOWED)[number], unknown>
>;

export async function updateAdAccountAsAdmin(
  accountId: string,
  payload: AdAccountUpdateInput & { supplier_fee_pct?: unknown },
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (typeof accountId !== "string" || accountId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const { data: existing } = await supabase
    .from("ad_accounts")
    .select("id, tenant_id, updated_at")
    .eq("id", accountId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Ad account not found", code: "not_found" };
  if (existing.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(existing.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This ad account was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of AD_ACCOUNT_UPDATE_ALLOWED) {
    if (col in payload) cleaned[col] = payload[col];
  }
  if (typeof cleaned.fee === "number" && (cleaned.fee < 0 || cleaned.fee > 100)) {
    return { ok: false, error: "Fee must be between 0 and 100" };
  }
  // The cost row is its own write, so an update that ONLY changes the
  // supplier fee is legitimate and must not trip "No updatable fields".
  const touchesFee = payload.supplier_fee_pct !== undefined;
  if (Object.keys(cleaned).length === 0 && !touchesFee) {
    return { ok: false, error: "No updatable fields" };
  }

  if (Object.keys(cleaned).length > 0) {
    cleaned.updated_at = new Date().toISOString();
    // .select() and count the rows: an UPDATE matching NOTHING is not an
    // error in PostgREST, so without this an RLS refusal, a deleted row or a
    // stale id all reported success and the screen re-rendered the old value.
    const { data: rows, error: updateError } = await supabase
      .from("ad_accounts")
      .update(cleaned)
      .eq("id", accountId)
      .eq("tenant_id", profile.tenant_id)
      .select("id");
    if (updateError) return { ok: false, error: updateError.message };
    const wrote = wroteSomething(rows);
    if (!wrote.ok) return wrote;
  }

  const feeRes = await upsertSupplierFee(
    supabase,
    profile,
    accountId,
    payload.supplier_fee_pct,
  );
  if (!feeRes.ok) {
    // The ad-account fields (if any) did save. Say so rather than reporting
    // a clean success or a total failure — neither would be true.
    return Object.keys(cleaned).length > 0
      ? { ok: true, data: null, warning: `Saved, but the supplier fee was not: ${feeRes.error}` }
      : { ok: false, error: feeRes.error, code: "forbidden" };
  }

  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// ad_account_requests: admin reject
// ─────────────────────────────────────────
export async function rejectAdAccountRequest(
  requestId: string,
  reason: string,
  ifUpdatedAt?: string,
): Promise<
  ActionResult<{ refunded: number; currency: string; perkRestored: boolean }>
> {
  if (typeof requestId !== "string" || requestId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: req } = await supabase
    .from("ad_account_requests")
    .select("id, tenant_id, status")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };
  if (req.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (req.status === "completed") {
    return { ok: false, error: "Request already completed" };
  }
  if (!(await checkVersion(supabase, "ad_account_requests", requestId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This request was changed by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";

  // REJECTING GIVES THE FEE BACK. Requesting an ad account costs the
  // customer 50 EUR, taken from their wallet the moment they send it — the
  // form says exactly that. This used to write `status = 'rejected'` and
  // nothing else, so PSM declined to provide the thing and kept the money,
  // with nothing on any screen saying so.
  //
  // One RPC, one transaction: the rejection, the refund and the free-request
  // perk all move together, because two steps is how the second one gets
  // forgotten — which is what happened.
  const { data: refund, error: rpcError } = await supabase.rpc(
    "ad_account_request_reject_refund",
    { p_request_id: requestId, p_reason: trimmedReason || null },
  );
  if (rpcError) return { ok: false, error: safeErrorMessage(rpcError) };

  const paid = refund as {
    refunded?: number;
    currency?: string;
    perk_restored?: boolean;
  } | null;
  return {
    ok: true,
    data: {
      refunded: Number(paid?.refunded ?? 0),
      currency: String(paid?.currency ?? "EUR"),
      perkRestored: !!paid?.perk_restored,
    },
  };
}

// ─────────────────────────────────────────
// setAdAccountRequestStatus — allow-listed status transitions
// ─────────────────────────────────────────
const REQUEST_STATUS = [
  "pending",
  "payment_pending",
  "in_progress",
  "completed",
  "rejected",
  "cancelled",
] as const;
type RequestStatus = (typeof REQUEST_STATUS)[number];

export async function setAdAccountRequestStatus(
  requestId: string,
  status: RequestStatus,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (typeof requestId !== "string" || requestId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  if (!REQUEST_STATUS.includes(status)) {
    return { ok: false, error: "Invalid status" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: req } = await supabase
    .from("ad_account_requests")
    .select("id, tenant_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };
  if (req.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (!(await checkVersion(supabase, "ad_account_requests", requestId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This request was changed by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const { data: rows, error } = await supabase
    .from("ad_account_requests")
    .update({ status })
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const wrote = wroteSomething(rows);
  if (!wrote.ok) return wrote;
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// createAdAccountFromRequest — combined operation:
// create the ad_account and mark the request completed atomically
// (best-effort — Supabase JS client can't do multi-statement tx from
// server actions; we roll back the account if the request update fails)
// ─────────────────────────────────────────
export async function createAdAccountFromRequest(
  requestId: string,
  accountInput: AdAccountInsertInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  if (typeof requestId !== "string" || requestId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }

  const { data: req } = await supabase
    .from("ad_account_requests")
    .select("id, tenant_id, status, advertiser_id")
    .eq("id", requestId)
    .maybeSingle();
  if (!req) return { ok: false, error: "Request not found" };
  if (req.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (req.status === "completed") {
    return { ok: false, error: "Request already completed" };
  }
  // A rejected request is not a request any more. Without this, admin B
  // rejecting while admin A has the review dialog open did not stop A from
  // creating the account — the customer then held a rejection AND an
  // account, and the 50 euro fee was returned in neither case.
  if (req.status === "rejected") {
    return {
      ok: false,
      error:
        "Somebody rejected this request while you had it open. Set it back to pending first if it should go ahead.",
    };
  }

  // Force the correct advertiser_id from the request row.
  const created = await createAdAccountAsAdmin({
    ...accountInput,
    advertiser_id: req.advertiser_id,
  });
  if (!created.ok) return created;

  // CLAIM IT. The status predicate is the whole guard: two admins who both
  // read `pending` both got here, both created an account and both marked
  // the request completed — one request, two ad accounts, two ok:true.
  // Its siblings rejectAdAccountRequest and setAdAccountRequestStatus both
  // take ifUpdatedAt; this one was missed, and a row-version check would
  // not have been enough anyway — the second write has to fail because the
  // row is no longer claimable, not because it changed.
  const { data: reqRows, error: reqError } = await supabase
    .from("ad_account_requests")
    .update({ status: "completed", rejection_reason: null })
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id)
    .neq("status", "completed")
    .select("id");

  // The same rollback for a write that MATCHED NOTHING as for one that
  // errored. Leaving the request open beside a created account is how the
  // next admin creates a second one for the same request.
  if (reqError || !reqRows || reqRows.length === 0) {
    // COUNT THE ROWS. If this matches nothing, the advertiser keeps a
    // real, visible ad account while the admin is told it was rolled back
    // — and the retry creates a second one. A rollback runs on the same
    // client whose write just failed, which is precisely when it is least
    // trustworthy.
    const { data: rolledBack } = await supabase
      .from("ad_accounts")
      .delete()
      .eq("id", created.data.id)
      .select("id");
    if ((rolledBack ?? []).length === 0) {
      console.error(
        `ad account rollback matched no rows — ${created.data.id} still exists and the customer can see it`,
      );
    }
    return {
      ok: false,
      error:
        reqError?.message ??
        "The account was not created: the request could not be marked completed, so it was rolled back. Reload and try again.",
    };
  }
  return created;
}
