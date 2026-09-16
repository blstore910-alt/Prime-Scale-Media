"use server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { LIMITS, rateLimitCheck } from "@/lib/rate-limit";
import { resolveAdminContext } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Per-user throttle for a customer-initiated financial request.
// Returns the caller id (for reuse) or an error result.
async function throttleFinancial(
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const { data } = await supabase.auth.getUser();
  const uid = data.user?.id;
  if (!uid) return { ok: false, error: "Unauthorized" };
  const allowed = await rateLimitCheck(LIMITS.financialRequest, `user:${uid}`);
  if (!allowed) {
    return { ok: false, error: "Too many requests — try again later." };
  }
  return { ok: true, userId: uid };
}

// ─────────────────────────────────────────
// requestAdAccountWithdrawal — advertiser
// Pulls balance from one of their ad accounts back to their wallet.
// The RPC validates account ownership; no auto balance check (admin
// is the gate until Supplier 1 is wired).
// ─────────────────────────────────────────
export async function requestAdAccountWithdrawal(input: {
  ad_account_id: string;
  amount: number;
  currency: "USD" | "EUR";
  reason?: string;
}): Promise<ActionResult<{ id: string }>> {
  // resolveAdminContext, not maintenanceGuard alone. These actions used to
  // go straight to the RPC and lean on its own `role = 'admin'` check — and
  // NO money RPC in the schema tests is_active or status alongside the role.
  // So a deactivated admin kept every power they had, which is precisely the
  // thing deactivating them is meant to remove. This guard checks the role,
  // the tenant AND that the account is still active, and it carries the
  // maintenance freeze with it.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { supabase } = auth.ctx;
  const gate = await throttleFinancial(supabase);
  if (!gate.ok) return gate;

  const amount = Number(input?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a positive amount." };
  }
  if (input.currency !== "USD" && input.currency !== "EUR") {
    return { ok: false, error: "Unsupported currency." };
  }
  if (typeof input.ad_account_id !== "string" || !input.ad_account_id) {
    return { ok: false, error: "Pick an ad account." };
  }

  const { data, error } = await supabase.rpc("ad_account_withdrawal_request", {
    p_ad_account_id: input.ad_account_id,
    p_amount: amount,
    p_currency: input.currency,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: { id: row?.id } };
}

// ─────────────────────────────────────────
// approveAdAccountWithdrawal — admin
// Credits the advertiser wallet and marks the withdrawal approved.
// ─────────────────────────────────────────
export async function approveAdAccountWithdrawal(
  withdrawalId: string,
): Promise<ActionResult> {
  // resolveAdminContext, not maintenanceGuard alone. These actions used to
  // go straight to the RPC and lean on its own `role = 'admin'` check — and
  // NO money RPC in the schema tests is_active or status alongside the role.
  // So a deactivated admin kept every power they had, which is precisely the
  // thing deactivating them is meant to remove. This guard checks the role,
  // the tenant AND that the account is still active, and it carries the
  // maintenance freeze with it.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof withdrawalId !== "string" || !withdrawalId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  const { error } = await supabase.rpc("ad_account_withdrawal_approve", {
    p_withdrawal_id: withdrawalId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// rejectAdAccountWithdrawal — admin
// ─────────────────────────────────────────
export async function rejectAdAccountWithdrawal(
  withdrawalId: string,
  reason?: string,
): Promise<ActionResult> {
  // resolveAdminContext, not maintenanceGuard alone. These actions used to
  // go straight to the RPC and lean on its own `role = 'admin'` check — and
  // NO money RPC in the schema tests is_active or status alongside the role.
  // So a deactivated admin kept every power they had, which is precisely the
  // thing deactivating them is meant to remove. This guard checks the role,
  // the tenant AND that the account is still active, and it carries the
  // maintenance freeze with it.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof withdrawalId !== "string" || !withdrawalId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  const { error } = await supabase.rpc("ad_account_withdrawal_reject", {
    p_withdrawal_id: withdrawalId,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
