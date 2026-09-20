"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { resolveAdminContext } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Admin raises a wallet balance correction (+/-). Super-admin approves.
export async function requestWalletAdjustment(input: {
  advertiser_id: string;
  delta: number;
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

  const delta = Number(input?.delta);
  // Rounds to the cent first: the column holds two decimals, so a delta
  // of 0.004 is "non-zero" to === and 0.00 to the database -- an
  // approved adjustment that moves nothing and explains nothing.
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.005) {
    return { ok: false, error: "Enter a non-zero amount (use - to remove)." };
  }
  if (input.currency !== "USD" && input.currency !== "EUR") {
    return { ok: false, error: "Unsupported currency." };
  }
  if (typeof input.advertiser_id !== "string" || !input.advertiser_id) {
    return { ok: false, error: "Pick an advertiser." };
  }

  const { supabase } = auth.ctx;
  const { data, error } = await supabase.rpc("wallet_adjustment_request", {
    p_advertiser_id: input.advertiser_id,
    p_delta: delta,
    p_currency: input.currency,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: { id: row?.id } };
}

export async function approveWalletAdjustment(
  adjustmentId: string,
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
  if (typeof adjustmentId !== "string" || !adjustmentId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  const { error } = await supabase.rpc("wallet_adjustment_approve", {
    p_adjustment_id: adjustmentId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

export async function rejectWalletAdjustment(
  adjustmentId: string,
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
  if (typeof adjustmentId !== "string" || !adjustmentId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  const { error } = await supabase.rpc("wallet_adjustment_reject", {
    p_adjustment_id: adjustmentId,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
