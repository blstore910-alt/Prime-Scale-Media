"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maintenanceGuard, versionMatches, type ActionResult } from "./_shared";

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

// ─────────────────────────────────────────
// ad_accounts: create
// ─────────────────────────────────────────
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
  input: AdAccountInsertInput,
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
  payload: AdAccountUpdateInput,
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
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No updatable fields" };
  }
  cleaned.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("ad_accounts")
    .update(cleaned)
    .eq("id", accountId)
    .eq("tenant_id", profile.tenant_id);
  if (updateError) return { ok: false, error: updateError.message };
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// ad_account_requests: admin reject
// ─────────────────────────────────────────
export async function rejectAdAccountRequest(
  requestId: string,
  reason: string,
): Promise<ActionResult> {
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

  const trimmedReason = typeof reason === "string" ? reason.trim() : "";
  const { error } = await supabase
    .from("ad_account_requests")
    .update({
      status: "rejected",
      rejection_reason: trimmedReason.length > 0 ? trimmedReason : null,
    })
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
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

  const { error } = await supabase
    .from("ad_account_requests")
    .update({ status })
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };
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

  // Force the correct advertiser_id from the request row.
  const created = await createAdAccountAsAdmin({
    ...accountInput,
    advertiser_id: req.advertiser_id,
  });
  if (!created.ok) return created;

  const { error: reqError } = await supabase
    .from("ad_account_requests")
    .update({ status: "completed", rejection_reason: null })
    .eq("id", requestId)
    .eq("tenant_id", profile.tenant_id);

  if (reqError) {
    // Roll back the ad_account so we don't have an orphan.
    await supabase.from("ad_accounts").delete().eq("id", created.data.id);
    return { ok: false, error: reqError.message };
  }
  return created;
}
