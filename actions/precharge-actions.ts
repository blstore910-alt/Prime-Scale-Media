"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { resolveAdminContext } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Admin advances wallet credit to an advertiser before their payment
// clears. Amount is admin-chosen. Admin-gated via the RPC's
// _require_profile('admin').
export async function createWalletPrecharge(input: {
  advertiser_id: string;
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

  const amount = Number(input?.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    return { ok: false, error: "Enter a positive amount." };
  }
  if (input.currency !== "USD" && input.currency !== "EUR") {
    return { ok: false, error: "Unsupported currency." };
  }
  if (typeof input.advertiser_id !== "string" || !input.advertiser_id) {
    return { ok: false, error: "Pick an advertiser." };
  }

  const { supabase } = auth.ctx;
  const { data, error } = await supabase.rpc("wallet_precharge_create", {
    p_advertiser_id: input.advertiser_id,
    p_amount: amount,
    p_currency: input.currency,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: { id: row?.id } };
}

// Admin advances the credit for a specific PENDING wallet top-up
// (money not arrived yet). Credits the wallet now; the advance settles
// automatically when the top-up is later verified.
export async function prechargeTopup(
  topupId: string,
): Promise<ActionResult<{ id: string }>> {
  // resolveAdminContext, not maintenanceGuard alone. These actions used to
  // go straight to the RPC and lean on its own `role = 'admin'` check — and
  // NO money RPC in the schema tests is_active or status alongside the role.
  // So a deactivated admin kept every power they had, which is precisely the
  // thing deactivating them is meant to remove. This guard checks the role,
  // the tenant AND that the account is still active, and it carries the
  // maintenance freeze with it.
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  const { data, error } = await supabase.rpc("wallet_precharge_from_topup", {
    p_topup_id: topupId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: { id: row?.id } };
}

// Admin settles an outstanding precharge once the real payment has
// arrived. Omit amount to settle the full outstanding balance.
export async function settleWalletPrecharge(
  prechargeId: string,
  amount?: number,
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
  if (typeof prechargeId !== "string" || !prechargeId) {
    return { ok: false, error: "Invalid input" };
  }
  const settleAmount =
    amount == null ? null : Number.isFinite(Number(amount)) ? Number(amount) : null;

  const { supabase } = auth.ctx;
  const { error } = await supabase.rpc("wallet_precharge_settle", {
    p_precharge_id: prechargeId,
    p_amount: settleAmount,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
