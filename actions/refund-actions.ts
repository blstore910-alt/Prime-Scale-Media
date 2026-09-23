"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { notifyAdvertiser } from "@/lib/notify-advertiser";
import { resolveAdminContext } from "./_shared";

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
  payout_details?: string;
  business_name?: string;
  address?: string;
  bank_currency?: "USD" | "EUR" | "HKD";
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
  const { data, error } = await supabase.rpc("wallet_refund_request", {
    p_advertiser_id: input.advertiser_id,
    p_amount: amount,
    p_currency: input.currency,
    p_reason: input.reason ?? null,
    p_payout_details: input.payout_details ?? null,
    p_business_name: input.business_name ?? null,
    p_address: input.address ?? null,
    p_bank_currency: input.bank_currency ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: { id: row?.id } };
}

// Super-admin approves → wallet debited. (Gate enforced in the RPC.)
export async function approveWalletRefund(
  refundId: string,
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
  if (typeof refundId !== "string" || !refundId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  const { data: rf } = await supabase
    .from("wallet_refunds")
    .select("advertiser_id, tenant_id, amount, currency, payout_bank_currency")
    .eq("id", refundId)
    .maybeSingle();

  const { error } = await supabase.rpc("wallet_refund_approve", {
    p_refund_id: refundId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };

  // ── THEIR WALLET WAS JUST EMPTIED TOWARDS THEIR BANK ──────────────
  //
  // Nothing said so. The balance simply dropped, and the transfer takes
  // days to show up on their side -- which is exactly the window in
  // which somebody thinks their money has gone missing.
  const row = rf as {
    advertiser_id?: string | null;
    tenant_id?: string | null;
    amount?: unknown;
    currency?: string | null;
  } | null;
  if (row?.advertiser_id) {
    await notifyAdvertiser(supabase, {
      advertiserId: row.advertiser_id,
      tenantId: row.tenant_id ?? null,
      type: "wallet_refunded",
      payload: {
        amount: row.amount ?? null,
        currency: row.currency ?? "EUR",
      },
    });
  }
  return { ok: true, data: null };
}

// Super-admin rejects.
export async function rejectWalletRefund(
  refundId: string,
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
  if (typeof refundId !== "string" || !refundId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  const { error } = await supabase.rpc("wallet_refund_reject", {
    p_refund_id: refundId,
    p_reason: reason ?? null,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
