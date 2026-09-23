"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { resolveAdminContext, type ActionResult } from "./_shared";

// ─────────────────────────────────────────────────────────────────────
// The money-in queue that MAINTENANCE_MODE could not freeze
// ─────────────────────────────────────────────────────────────────────
// `hooks/use-update-transaction.ts` called wallet_topup_admin_verify,
// _reject and _undo straight from a client component with the browser's
// own Supabase client. Three consequences, and the first is the one that
// matters during an incident:
//
//   1  no `maintenanceGuard()`. MAINTENANCE_MODE=true is the switch that
//      freezes writes app-wide while something is wrong, and it lives in
//      `resolveAdminContext`, which only runs on the server. The
//      ad-account queue froze and the LARGER money event — crediting a
//      customer's wallet from a bank transfer — kept going.
//   2  no is_active / status check. The RPCs test `role = 'admin'` and
//      nothing else, so a deactivated admin kept the power to credit a
//      wallet, which is exactly what deactivating them is meant to take
//      away.
//   3  nothing in the server logs. A wallet credit left no trace outside
//      the database.
//
// CLAUDE.md's rule for this is one line: every mutation on a business
// table goes through a SECURITY DEFINER RPC or a server action with a
// tenant guard. The RPC is there and is still the thing that writes; it
// simply must be reached through a door that can be locked.
//
// The notifications stay where they were: separate, best-effort and
// AFTER the write, because the money has already moved and an action
// that reports failure after a successful verify is worse than a
// customer who was not told.
// ─────────────────────────────────────────────────────────────────────

export async function verifyWalletTopupAsAdmin(
  topupId: string,
): Promise<ActionResult> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Invalid input" };
  }
  const { error } = await auth.ctx.supabase.rpc("wallet_topup_admin_verify", {
    p_topup_id: topupId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

export async function rejectWalletTopupAsAdmin(
  topupId: string,
  reason: string,
): Promise<ActionResult> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Invalid input" };
  }
  // The dialog demands one and a trigger demands one, and this is the
  // third place it is asked for — because the dialog is a suggestion,
  // and a caller that is not the dialog reaches the same RPC.
  const trimmed = typeof reason === "string" ? reason.trim() : "";
  if (trimmed.length < 3) {
    return {
      ok: false,
      error:
        "A refusal needs a reason — the customer is shown it, so say what was wrong and what they can do about it.",
    };
  }
  const { error } = await auth.ctx.supabase.rpc("wallet_topup_admin_reject", {
    p_topup_id: topupId,
    p_reason: trimmed.slice(0, 500),
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

export async function undoWalletTopupAsAdmin(
  topupId: string,
): Promise<ActionResult> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Invalid input" };
  }
  const { error } = await auth.ctx.supabase.rpc("wallet_topup_admin_undo", {
    p_topup_id: topupId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
