"use server";

import { createClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
import { maintenanceGuard } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Admin raises a refund of a customer's wallet balance (they're
// leaving). Super-admin approves later.
export async function requestWalletRefund(input: {
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
  const { data, error } = await supabase.rpc("wallet_refund_request", {
    p_advertiser_id: input.advertiser_id,
    p_amount: amount,
    p_currency: input.currency,
    p_reason: input.reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: { id: row?.id } };
}

// Super-admin approves → wallet debited. (Gate enforced in the RPC.)
export async function approveWalletRefund(
  refundId: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof refundId !== "string" || !refundId) {
    return { ok: false, error: "Invalid input" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("wallet_refund_approve", {
    p_refund_id: refundId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

// Super-admin rejects.
export async function rejectWalletRefund(
  refundId: string,
  reason?: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof refundId !== "string" || !refundId) {
    return { ok: false, error: "Invalid input" };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("wallet_refund_reject", {
    p_refund_id: refundId,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
