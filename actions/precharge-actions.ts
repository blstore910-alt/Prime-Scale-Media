"use server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { maintenanceGuard } from "./_shared";

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
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;

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

  const supabase = await createClient();
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
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Invalid input" };
  }
  const supabase = await createClient();
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
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof prechargeId !== "string" || !prechargeId) {
    return { ok: false, error: "Invalid input" };
  }
  const settleAmount =
    amount == null ? null : Number.isFinite(Number(amount)) ? Number(amount) : null;

  const supabase = await createClient();
  const { error } = await supabase.rpc("wallet_precharge_settle", {
    p_precharge_id: prechargeId,
    p_amount: settleAmount,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
