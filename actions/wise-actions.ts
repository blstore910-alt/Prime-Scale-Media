"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { createAdminClient } from "@/lib/supabase/server";
import { resolveAdminContext, wroteSomething } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// Admin confirms a Wise deposit the matcher suggested — completes the
// suggested topup. Used during the safe-start phase where nothing
// auto-completes.
export async function confirmWiseSuggestion(
  transferId: string,
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
  if (typeof transferId !== "string" || !transferId) {
    return { ok: false, error: "Invalid input" };
  }
  const { supabase } = auth.ctx;
  const { error } = await supabase.rpc("wise_confirm_suggestion", {
    p_transfer_id: transferId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}

/**
 * Match a deposit to a top-up BY HAND, when the matcher could not.
 *
 * It genuinely cannot in ordinary cases: a customer who forgot the reference,
 * a bank that stripped it, two top-ups for the same amount. Leaving those to
 * be sorted out in the database is how a queue silently stops being worked.
 *
 * There is no new RPC. A manual match writes the pairing onto the transfer
 * and then goes through wise_confirm_suggestion, the same path a suggested
 * match takes — so crediting, the ledger write and whatever else that
 * function does stay in one place rather than being reimplemented here.
 *
 * THE AMOUNTS MUST AGREE. Confirming credits the TOP-UP's amount, not the
 * deposit's, so pairing a EUR 500 deposit with a EUR 1000 top-up would credit
 * a thousand euros for five hundred received. A cent of tolerance, matching
 * the automatic matcher; anything wider is a decision someone has to make
 * deliberately, with an adjustment, not by picking from a list.
 */
export async function matchWiseToTopup(
  transferId: string,
  topupId: string,
): Promise<ActionResult> {
  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (typeof transferId !== "string" || !transferId) {
    return { ok: false, error: "Invalid input" };
  }
  if (typeof topupId !== "string" || !topupId) {
    return { ok: false, error: "Pick a top-up to match." };
  }
  const { supabase, profile } = auth.ctx;

  const { data: transfer, error: tErr } = await supabase
    .from("wise_incoming_transfers")
    .select("id, amount_cents, currency, status, tenant_id")
    .eq("id", transferId)
    .maybeSingle();
  if (tErr) return { ok: false, error: safeErrorMessage(tErr) };
  if (!transfer) return { ok: false, error: "Deposit not found" };
  // A deposit is either unassigned (tenant_id null — the matcher could not
  // tell whose it was) or already ours. Anything else belongs to another
  // tenant, and the write below runs with the service role, so this check is
  // the only thing standing in its way — RLS will not catch it for us.
  if (
    transfer.tenant_id !== null &&
    transfer.tenant_id !== profile.tenant_id
  ) {
    return { ok: false, error: "Forbidden" };
  }
  if (transfer.status === "completed" || transfer.status === "confirmed") {
    return { ok: false, error: "That deposit has already been credited." };
  }

  const { data: topup, error: uErr } = await supabase
    .from("wallet_topups")
    .select("id, amount, currency, status, tenant_id")
    .eq("id", topupId)
    .maybeSingle();
  if (uErr) return { ok: false, error: safeErrorMessage(uErr) };
  if (!topup) return { ok: false, error: "Top-up not found" };
  if (topup.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if ((topup.status ?? "pending") !== "pending") {
    return { ok: false, error: "That top-up is no longer pending." };
  }

  const depCur = String(transfer.currency ?? "").toUpperCase();
  const topCur = String(topup.currency ?? "").toUpperCase();
  if (depCur !== topCur) {
    return {
      ok: false,
      error: `The deposit is in ${depCur} and the top-up is in ${topCur}. Credit that by hand instead.`,
    };
  }
  const depCents = Math.round(Number(transfer.amount_cents ?? 0));
  const topCents = Math.round(Number(topup.amount ?? 0) * 100);
  if (Math.abs(depCents - topCents) > 1) {
    return {
      ok: false,
      error: `The amounts differ — the deposit is ${(depCents / 100).toFixed(2)} and the top-up is ${(topCents / 100).toFixed(2)}. Confirming credits the top-up's amount, so this needs an adjustment rather than a match.`,
    };
  }

  // The service-role client, deliberately. wise_incoming_transfers carries a
  // SELECT policy and nothing else — its migration says so outright: "No
  // client writes — only the service-role webhook path writes". So this
  // UPDATE matched zero rows under the caller's client and the whole feature
  // was dead on arrival; it failed loudly rather than silently, thanks to the
  // row check below, but it never worked.
  //
  // Every authorisation this needs has already been done above, by hand,
  // because RLS is not doing it here: the caller is an active admin of this
  // tenant, the top-up is theirs and pending, the deposit is theirs or
  // unassigned, and the amounts agree to the cent. The write itself is one
  // column on one row, and wise_confirm_suggestion re-checks the caller
  // before it moves any money.
  const admin = await createAdminClient();
  const { data: linked, error: linkErr } = await admin
    .from("wise_incoming_transfers")
    .update({ suggested_topup_id: topupId, status: "suggested" })
    .eq("id", transferId)
    .select("id");
  if (linkErr) return { ok: false, error: safeErrorMessage(linkErr) };
  const wrote = wroteSomething(linked);
  if (!wrote.ok) return wrote;

  const { error } = await supabase.rpc("wise_confirm_suggestion", {
    p_transfer_id: transferId,
  });
  if (error) return { ok: false, error: safeErrorMessage(error) };
  return { ok: true, data: null };
}
