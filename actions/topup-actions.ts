"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maintenanceGuard, versionMatches, type ActionResult, wroteSomething } from "./_shared";
import { calculateTopupAmount, type MinimalRate } from "@/lib/utils-pure";
import { safeErrorMessage } from "@/lib/pure-error";
import { enqueueSupplierTopupPush } from "@/lib/integrations/enqueue";
import type { SupabaseClient } from "@supabase/supabase-js";

// Ad-account top-up types that carry a fee (mirrors the topup form).
const FEE_APPLICABLE_TYPES = ["top-up", "first-top-up"];

// The advertiser's effective top-up fee is driven by their PLAN
// (advertiser_plans.topup_fee_pct), then adjusted by any active top-up
// perk: a topup_fee_waiver zeroes it, a topup_discount subtracts its
// percent. Resolved server-side so the fee can never be understated by
// a tampered client payload. Advertisers with no plan and no perk keep
// the caller-supplied fee (no regression).
async function resolveEffectiveFeePct(
  supabase: SupabaseClient,
  advertiserId: string,
  fallbackPct: number,
): Promise<{ applied: boolean; pct: number }> {
  const { data: plan } = await supabase
    .from("advertiser_plans")
    .select("topup_fee_pct")
    .eq("advertiser_id", advertiserId)
    .maybeSingle();

  const { data: perks } = await supabase
    .from("advertiser_perks")
    .select("kind, amount, starts_at, expires_at")
    .eq("advertiser_id", advertiserId)
    .eq("active", true)
    .in("kind", ["topup_fee_waiver", "topup_discount"]);

  const now = Date.now();
  const activePerks = (perks ?? []).filter((p) => {
    const started = !p.starts_at || new Date(p.starts_at).getTime() <= now;
    const notExpired =
      !p.expires_at || new Date(p.expires_at).getTime() > now;
    return started && notExpired;
  });

  const hasPlan = plan != null && plan.topup_fee_pct != null;
  const waiver = activePerks.some((p) => p.kind === "topup_fee_waiver");
  const discount = activePerks
    .filter((p) => p.kind === "topup_discount")
    .reduce((max, p) => Math.max(max, Number(p.amount) || 0), 0);

  if (!hasPlan && !waiver && discount === 0) {
    return { applied: false, pct: fallbackPct };
  }
  const base = hasPlan ? Number(plan!.topup_fee_pct) : fallbackPct;
  const pct = waiver ? 0 : Math.max(0, base - discount);
  return { applied: true, pct };
}

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
    .select("id, role, tenant_id, user_id, full_name, email, is_active, status")
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
// top_ups: admin create (with allow-listed status + column allowlist)
// The caller's tenant is enforced server-side; status is either
// 'pending' or 'completed' (mark-paid switch).
// ─────────────────────────────────────────
const TOPUP_INSERT_ALLOWED = [
  "type",
  "currency",
  "amount_received",
  "amount_usd",
  "topup_amount",
  "fee",
  "fee_amount",
  "eur_value",
  "eur_topup",
  "account_id",
  "advertiser_id",
  "payment_slip",
  "notes",
  "source",
] as const;

type TopupInsertInput = Partial<
  Record<(typeof TOPUP_INSERT_ALLOWED)[number], unknown>
> & {
  status?: "pending" | "completed";
  mark_paid?: boolean;
};

// Write the top_up audit-trail row SERVER-side so updated_by/author are the
// authenticated session admin — never a client-supplied value. The old
// client-side insert let any admin forge the author or fabricate new_values
// (and for "create" it was actually broken: the returned {id} had no
// `author`, so author.id threw). Best-effort: the row already committed and
// the trigger-based audit_events still captures the change, so a log-insert
// failure must not fail the mutation.
async function writeTopupLog(
  supabase: SupabaseClient,
  profile: { id: string; full_name?: string | null; email?: string | null },
  topupId: string,
  action: "create" | "update" | "delete",
  values: Partial<
    Record<
      | "fee"
      | "topup_amount"
      | "amount_received"
      | "amount_usd"
      | "currency"
      | "status"
      | "is_deleted",
      unknown
    >
  >,
) {
  const { error } = await supabase.from("topup_logs").insert({
    topup_id: topupId,
    updated_by: profile.id,
    action,
    // topup_logs is readable by the advertiser who owns the top-up
    // (topup_logs_select in 20260828140000_rls_templates.sql allows
    // _is_own_advertiser), so this is a customer-facing row too. Id only.
    author: { id: profile.id },
    new_values: {
      fee: values.fee ?? null,
      topup_amount: values.topup_amount ?? null,
      amount_received: values.amount_received ?? null,
      amount_usd: values.amount_usd ?? null,
      currency: values.currency ?? null,
      status: values.status ?? null,
      is_deleted: values.is_deleted ?? null,
    },
  });
  if (error) {
    console.warn("topup_logs insert failed:", safeErrorMessage(error));
  }
}

export async function createTopupAsAdmin(
  input: TopupInsertInput,
): Promise<ActionResult<{ id: string }>> {
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  if (!input.advertiser_id || typeof input.advertiser_id !== "string") {
    return { ok: false, error: "advertiser_id required" };
  }

  // Verify the target advertiser belongs to this tenant.
  const { data: adv, error: advError } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", input.advertiser_id)
    .maybeSingle();
  if (advError || !adv) return { ok: false, error: "Advertiser not found" };
  if (adv.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // Verify the target ad account (when given) belongs to this tenant AND to
  // the same advertiser — an admin must not be able to attach a top-up to
  // another tenant's or another advertiser's account.
  if (typeof input.account_id === "string" && input.account_id.length > 0) {
    const { data: acct } = await supabase
      .from("ad_accounts")
      .select("id, tenant_id, advertiser_id")
      .eq("id", input.account_id)
      .maybeSingle();
    if (!acct || acct.tenant_id !== profile.tenant_id) {
      return { ok: false, error: "Ad account not found" };
    }
    if (acct.advertiser_id !== input.advertiser_id) {
      return {
        ok: false,
        error: "Ad account does not belong to this advertiser",
      };
    }
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of TOPUP_INSERT_ALLOWED) {
    if (col in input) cleaned[col] = input[col];
  }

  // Status: only pending or completed. mark_paid boolean is the UI switch.
  const requested = input.status ?? (input.mark_paid ? "completed" : "pending");
  if (requested !== "pending" && requested !== "completed") {
    return { ok: false, error: "Invalid status" };
  }
  cleaned.status = requested;
  cleaned.tenant_id = profile.tenant_id;
  // Only the profile id. An advertiser reads their own top_ups rows, so a
  // name and work email stamped here is our staff's PII delivered to the
  // customer — and nothing in the app ever read these fields back; who did
  // what is reconstructable from audit_events, which is admin-only.
  cleaned.author = { id: profile.id };

  // Authoritative fee: for fee-bearing top-ups, let the advertiser's plan
  // rate + active top-up perks drive the fee, and recompute the derived
  // amounts from it (same math as the client preview) so the stored values
  // can't be understated by the payload. No plan + no perk → untouched.
  if (typeof input.type === "string" && FEE_APPLICABLE_TYPES.includes(input.type)) {
    const fallbackPct = Number(input.fee) || 0;
    const { applied, pct } = await resolveEffectiveFeePct(
      supabase,
      input.advertiser_id,
      fallbackPct,
    );
    if (applied) {
      const { data: rate } = await supabase
        .from("exchange_rates")
        .select("eur")
        .eq("tenant_id", profile.tenant_id)
        .eq("is_active", true)
        .maybeSingle();
      const rates: MinimalRate[] = [{ eur: Number(rate?.eur) || 0 }];
      const amountReceived = Number(input.amount_received) || 0;
      const currency = String(input.currency || "USD");
      const { topupAmount, amountUSD, feeAmount } = calculateTopupAmount(
        amountReceived,
        rates,
        currency,
        pct,
      );
      cleaned.fee = pct;
      cleaned.fee_amount = feeAmount.toFixed(2);
      cleaned.topup_amount = topupAmount.toFixed(2);
      cleaned.amount_usd = amountUSD.toFixed(2);
    }
  }

  const { data: inserted, error: insertError } = await supabase
    .from("top_ups")
    .insert(cleaned)
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  await writeTopupLog(supabase, profile, inserted.id, "create", {
    ...cleaned,
    amount_received: input.amount_received,
    currency: input.currency,
  });

  // Created already-paid → the supplier has to fund the account. No-op unless
  // the auto-push gate is armed; never fails the top-up. See lib/integrations/autopush.
  if (requested === "completed") {
    await enqueueSupplierTopupPush(supabase, {
      topupId: inserted.id,
      tenantId: profile.tenant_id,
    });
  }

  return { ok: true, data: { id: inserted.id } };
}

// ─────────────────────────────────────────
// top_ups: bulk admin insert (used by bulk-ad-accounts-topup-dialog)
// ─────────────────────────────────────────
export async function bulkCreateTopupsAsAdmin(
  rows: TopupInsertInput[],
): Promise<ActionResult<{ inserted: number }>> {
  if (!Array.isArray(rows) || rows.length === 0) {
    return { ok: false, error: "No rows" };
  }
  if (rows.length > 200) {
    return { ok: false, error: "Too many rows (max 200)" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // Verify every referenced advertiser belongs to caller's tenant, in one round-trip.
  const advertiserIds = Array.from(
    new Set(
      rows
        .map((r) => r.advertiser_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  if (advertiserIds.length === 0) {
    return { ok: false, error: "advertiser_id required on every row" };
  }
  const { data: advs, error: advsError } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .in("id", advertiserIds);
  if (advsError) return { ok: false, error: advsError.message };
  const validIds = new Set(
    (advs ?? [])
      .filter((a) => a.tenant_id === profile.tenant_id)
      .map((a) => a.id),
  );
  if (validIds.size !== advertiserIds.length) {
    return { ok: false, error: "Forbidden advertiser id in batch" };
  }

  // Verify every referenced ad account belongs to caller's tenant and to the
  // advertiser it's paired with in the same row — no cross-tenant / mismatched
  // account attachment.
  const accountIds = Array.from(
    new Set(
      rows
        .map((r) => r.account_id)
        .filter((v): v is string => typeof v === "string" && v.length > 0),
    ),
  );
  if (accountIds.length > 0) {
    const { data: accts, error: acctsError } = await supabase
      .from("ad_accounts")
      .select("id, tenant_id, advertiser_id")
      .in("id", accountIds);
    if (acctsError) return { ok: false, error: acctsError.message };
    const acctById = new Map(
      (accts ?? [])
        .filter((a) => a.tenant_id === profile.tenant_id)
        .map((a) => [a.id, a.advertiser_id]),
    );
    for (const row of rows) {
      const acctId = row.account_id;
      if (typeof acctId !== "string" || acctId.length === 0) continue;
      if (!acctById.has(acctId)) {
        return { ok: false, error: "Forbidden ad account id in batch" };
      }
      if (acctById.get(acctId) !== row.advertiser_id) {
        return {
          ok: false,
          error: "Ad account does not belong to the paired advertiser",
        };
      }
    }
  }

  // Id only — see the note on the single-create path. This lands on
  // customer-readable top_ups rows.
  const author = { id: profile.id };
  const payload = rows.map((row) => {
    const cleaned: Record<string, unknown> = {};
    for (const col of TOPUP_INSERT_ALLOWED) {
      if (col in row) cleaned[col] = row[col];
    }
    const requested =
      row.status ?? (row.mark_paid ? "completed" : "pending");
    if (requested !== "pending" && requested !== "completed") {
      throw new Error("Invalid status in bulk payload");
    }
    cleaned.status = requested;
    cleaned.tenant_id = profile.tenant_id;
    cleaned.author = author;
    return cleaned;
  });

  const { data: insertedRows, error: insertError } = await supabase
    .from("top_ups")
    .insert(payload)
    .select("id, status");
  if (insertError) return { ok: false, error: insertError.message };

  // Queue a supplier push for each row that went in already-paid. Sequential
  // on purpose: a bulk run is at most 200 rows and each enqueue is two small
  // reads plus an insert — hammering the DB in parallel here buys nothing and
  // makes a partial failure harder to read. No-op unless the gate is armed.
  for (const row of (insertedRows ?? []) as Array<{ id: string; status: string }>) {
    if (row.status !== "completed") continue;
    await enqueueSupplierTopupPush(supabase, {
      topupId: row.id,
      tenantId: profile.tenant_id,
    });
  }

  return { ok: true, data: { inserted: payload.length } };
}

// ─────────────────────────────────────────
// top_ups: admin partial update
// ─────────────────────────────────────────
const TOPUP_UPDATE_ALLOWED = [
  "type",
  "currency",
  "amount_received",
  "amount_usd",
  "topup_amount",
  "fee",
  "fee_amount",
  "notes",
  "status",
  "is_deleted",
] as const;

type TopupUpdateInput = Partial<
  Record<(typeof TOPUP_UPDATE_ALLOWED)[number], unknown>
>;

export async function updateTopupAsAdmin(
  topupId: string,
  payload: TopupUpdateInput,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (typeof topupId !== "string" || topupId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  // Verify target is in caller's tenant
  const { data: existing } = await supabase
    .from("top_ups")
    .select("id, tenant_id, updated_at")
    .eq("id", topupId)
    .maybeSingle();
  if (!existing) return { ok: false, error: "Top-up not found", code: "not_found" };
  if (existing.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(existing.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This top-up was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of TOPUP_UPDATE_ALLOWED) {
    if (col in payload) cleaned[col] = payload[col];
  }
  if (cleaned.status !== undefined) {
    const s = cleaned.status;
    if (s !== "pending" && s !== "completed" && s !== "rejected") {
      return { ok: false, error: "Invalid status" };
    }
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No updatable fields" };
  }
  cleaned.updated_at = new Date().toISOString();
  // Only the profile id. An advertiser reads their own top_ups rows, so a
  // name and work email stamped here is our staff's PII delivered to the
  // customer — and nothing in the app ever read these fields back; who did
  // what is reconstructable from audit_events, which is admin-only.
  cleaned.author = { id: profile.id };

  // Count the rows — see wroteSomething(). An edit to a top-up that silently
  // did not save would be written to the log below as though it had, so the
  // log would disagree with the row it describes.
  const { data: updatedTopup, error: updateError } = await supabase
    .from("top_ups")
    .update(cleaned)
    .eq("id", topupId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (updateError) return { ok: false, error: updateError.message };
  const wroteTopup = wroteSomething(updatedTopup);
  if (!wroteTopup.ok) return wroteTopup;

  await writeTopupLog(
    supabase,
    profile,
    topupId,
    payload.is_deleted === true ? "delete" : "update",
    payload,
  );

  // Marked paid → queue the supplier push. Enqueue is idempotent on the
  // top-up id, so re-saving an already-completed row can't double-fund.
  // No-op unless the auto-push gate is armed. See lib/integrations/autopush.
  if (cleaned.status === "completed" && payload.is_deleted !== true) {
    await enqueueSupplierTopupPush(supabase, {
      topupId,
      tenantId: profile.tenant_id,
    });
  }

  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// verifyAdTopup — the admin "Verify payment" action
// ─────────────────────────────────────────
// The verify dialog used to call the top_up_admin_verify RPC straight from
// the browser. The RPC itself is safe (SECURITY DEFINER, it does its own
// authorization), so nothing was exposed — but going around the server
// action also went around the supplier push. Verifying a top-up is EXACTLY
// the moment we learn the money is ours and the supplier should be told, and
// it was the one path that never told them. Silently: no error, no queued
// job, just an account that never gets funded.
//
// Everything else that marks a top-up completed already enqueues here. This
// makes the canonical path do the same.
export async function verifyAdTopup(
  topupId: string,
  newFeePercent: number | null,
): Promise<ActionResult<unknown>> {
  if (typeof topupId !== "string" || topupId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  if (
    newFeePercent !== null &&
    (typeof newFeePercent !== "number" ||
      !Number.isFinite(newFeePercent) ||
      newFeePercent < 0 ||
      newFeePercent > 100)
  ) {
    return { ok: false, error: "Invalid fee percentage", code: "invalid" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error, code: "forbidden" };
  const { supabase, profile } = ctx;

  const { data, error } = await supabase.rpc("top_up_admin_verify", {
    p_top_up_id: topupId,
    p_new_fee_percent: newFeePercent,
  });
  if (error) return { ok: false, error: error.message };

  // Idempotent on the top-up id, and a no-op unless BOTH auto-push switches
  // are armed — so this cannot fund anything while the gate is shut, and
  // re-verifying cannot fund it twice.
  await enqueueSupplierTopupPush(supabase, {
    topupId,
    tenantId: profile.tenant_id,
  });

  return { ok: true, data };
}
