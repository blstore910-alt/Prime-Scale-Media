"use server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { maintenanceGuard } from "./_shared";

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
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;

  const delta = Number(input?.delta);
  if (!Number.isFinite(delta) || delta === 0) {
    return { ok: false, error: "Enter a non-zero amount (use - to remove)." };
  }
  if (input.currency !== "USD" && input.currency !== "EUR") {
    return { ok: false, error: "Unsupported currency." };
  }
  if (typeof input.advertiser_id !== "string" || !input.advertiser_id) {
    return { ok: false, error: "Pick an advertiser." };
  }

  const supabase = await createClient();
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
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof adjustmentId !== "string" || !adjustmentId) {
    return { ok: false, error: "Invalid input" };
  }
  const supabase = await createClient();
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
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof adjustmentId !== "string" || !adjustmentId) {
    return { ok: false, error: "Invalid input" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("wallet_adjustment_reject", {
    p_adjustment_id: adjustmentId,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
