"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { resolveAdminContext, resolveOwnerContext } from "./_shared";

const round2 = (n: number) => Number(Number(n).toFixed(2));

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

  // ROUNDED, because the comment below has always said so and the code
  // did not. The column is numeric with no scale, so 10.005 is stored
  // and applied exactly -- while every screen prints it with toFixed(2)
  // as 10.01. The balance and the figure explaining it then disagree by
  // half a cent, for ever, with nothing able to account for it.
  const delta = round2(Number(input?.delta));
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

// ─────────────────────────────────────────────────────────────────────
// adminAdjustWalletBalances
//
// The "Edit wallet balances" dialog called `wallet_admin_adjust`
// STRAIGHT FROM THE BROWSER, and that function's only guard is
// `role = 'admin'`. PostgREST puts every public function on
// /rest/v1/rpc/<name>, so one line in devtools was a wallet credit of
// any size, on any wallet, by any employee admin:
//
//   supabase.rpc('wallet_admin_adjust',
//     { p_wallet_id: x, p_eur_delta: 50000, p_usd_delta: 0,
//       p_reason: 'correction' })
//
// Nothing above it asked whether that admin is the owner, whether the
// wallet is even in their tenant, or whether the balance they based
// the number on is still the balance. The dialog asked all three; the
// dialog is not a guard.
//
// This whole file is the flow that was BUILT for a balance
// correction: an admin REQUESTS one, the owner APPROVES it. A direct
// write is the owner's own escape hatch, so it goes through
// resolveOwnerContext — an employee admin now gets pointed back at
// requestWalletAdjustment instead of moving the money themselves.
//
// expectedUsd/expectedEur is the same idea as `ifUpdatedAt` elsewhere.
// The dialog shows a CURRENT balance, the operator types a TARGET, and
// the difference is sent as a delta. If someone verified a top-up in
// between, that delta lands on a different balance than the one on
// screen and the result is a number nobody chose. Sending what was on
// screen lets the server refuse instead.
// ─────────────────────────────────────────────────────────────────────
export async function adminAdjustWalletBalances(input: {
  walletId: string;
  usdDelta: number;
  eurDelta: number;
  reason: string;
  expectedUsd?: number | null;
  expectedEur?: number | null;
}): Promise<ActionResult<{ usd: number; eur: number }>> {
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const walletId = typeof input?.walletId === "string" ? input.walletId : "";
  if (!walletId) return { ok: false, error: "Wallet not found." };

  const usdDelta = round2(Number(input?.usdDelta ?? 0));
  const eurDelta = round2(Number(input?.eurDelta ?? 0));
  if (!Number.isFinite(usdDelta) || !Number.isFinite(eurDelta)) {
    return { ok: false, error: "Enter a valid amount." };
  }
  // Below half a cent is zero to the column, so a "change" that rounds
  // away would write an audit row explaining a movement of nothing.
  if (Math.abs(usdDelta) < 0.005 && Math.abs(eurDelta) < 0.005) {
    return { ok: false, error: "No balance change to apply." };
  }

  const reason = String(input?.reason ?? "").trim();
  if (reason.length < 3) {
    return { ok: false, error: "Give a reason of at least 3 characters." };
  }

  // Re-fetch the row server-side: the tenant guard and the balance the
  // delta is applied to both have to come from the database, not from
  // whatever the caller sent.
  const { data: wallet, error: walletError } = await supabase
    .from("wallets")
    .select("id, tenant_id, usd_balance, eur_balance")
    .eq("id", walletId)
    .maybeSingle();
  if (walletError) {
    return { ok: false, error: safeErrorMessage(walletError) };
  }
  // maybeSingle returns null WITHOUT an error for a row RLS refused as
  // well as for a row that is not there, so both land here on purpose.
  if (!wallet) return { ok: false, error: "Wallet not found." };
  if (wallet.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const currentUsd = round2(Number(wallet.usd_balance ?? 0));
  const currentEur = round2(Number(wallet.eur_balance ?? 0));

  const moved = (expected: number | null | undefined, current: number) =>
    expected !== null &&
    expected !== undefined &&
    Number.isFinite(Number(expected)) &&
    Math.abs(round2(Number(expected)) - current) >= 0.005;
  if (moved(input.expectedUsd, currentUsd) || moved(input.expectedEur, currentEur)) {
    return {
      ok: false,
      error:
        "This wallet changed while the dialog was open. Close it and start again so the new balance is the one you correct.",
    };
  }

  // The dialog refuses a negative result; so does the server now. A
  // wallet below zero is a number no screen in this app can explain.
  if (round2(currentUsd + usdDelta) < 0 || round2(currentEur + eurDelta) < 0) {
    return { ok: false, error: "Final balance cannot be negative." };
  }

  const { error } = await supabase.rpc("wallet_admin_adjust", {
    p_wallet_id: walletId,
    p_usd_delta: usdDelta,
    p_eur_delta: eurDelta,
    p_reason: reason,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };

  return {
    ok: true,
    data: {
      usd: round2(currentUsd + usdDelta),
      eur: round2(currentEur + eurDelta),
    },
  };
}
