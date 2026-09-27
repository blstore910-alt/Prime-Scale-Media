"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { maintenanceGuard, resolveAdminContext } from "./_shared";

// ── A FEE CHANGE IS ASKED FOR, NOT MADE ──────────────────────────────
//
// The owner, 27-09: "en als admin de fee moet aanpassen dan moet de
// request bij a super admin belanden, niet aanpassen dan niet."
//
// The refusing half already existed and is stricter than it looks:
// `feeIsAPrice` lets an employee admin save only a blank, the customer's
// plan rate, or the ad-account type's default. Anything else is a price
// and belongs to the owner -- at creation AND at update, enforced on all
// three writers.
//
// What was missing is where a refusal GOES. Until now the admin got a
// sentence ending in "ask the owner", and that was the whole mechanism:
// no row, no queue, no notice. In practice that means a message on the
// phone, or nothing.
//
// The write itself is a SECURITY DEFINER RPC (plak 111), not an update
// from here: approving changes a price, which is a financial write, and
// CLAUDE.md puts those in an RPC with the owner check inside it. These
// actions are the boundary in front of it -- the maintenance freeze, the
// role, and PostgREST's error turned into a sentence somebody can read.

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * An admin asks the owner to change what a customer is charged.
 *
 * The reason is required on the way in. The owner sees a number, an
 * account and a person; without the why they have to go and ask, which
 * is the thing this is meant to replace.
 */
export async function requestFeeChange(input: {
  adAccountId: string;
  requestedFee: number;
  reason: string;
}): Promise<ActionResult<{ id: string }>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };

  const id = String(input?.adAccountId ?? "").trim();
  if (!id) return { ok: false, error: "Pick an ad account." };

  const fee = Number(input?.requestedFee);
  if (!Number.isFinite(fee) || fee < 0 || fee > 100) {
    return { ok: false, error: "Enter a percentage between 0 and 100." };
  }

  const reason = String(input?.reason ?? "").trim();
  if (reason.length < 3) {
    return {
      ok: false,
      error: "Say why — the owner is deciding on a price from this alone.",
    };
  }

  const { data, error } = await auth.ctx.supabase.rpc("fee_change_request", {
    p_ad_account_id: id,
    p_requested_fee: fee,
    p_reason: reason,
  });
  if (error) {
    // 42P01: plak 111 has not been pasted yet. Say that rather than
    // handing somebody PostgREST's sentence about a relation.
    if ((error as { code?: string }).code === "42P01") {
      return {
        ok: false,
        error:
          "The place to keep this is not set up yet. Ask us to run the migration, then try again.",
      };
    }
    // 23505: the unique index on one open request per account.
    if ((error as { code?: string }).code === "23505") {
      return {
        ok: false,
        error:
          "There is already a fee change waiting on the owner for this account.",
      };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }

  const row = Array.isArray(data) ? data[0] : data;
  return { ok: true, data: { id: String((row as { id?: string })?.id ?? "") } };
}

/**
 * The owner approves or refuses one.
 *
 * Approving is what moves the price; the RPC does both halves in one
 * statement so a decision cannot be recorded without the fee following
 * it, or the other way round.
 *
 * A refusal needs a reason for the same reason a refused withdrawal
 * does: without one the person who asked learns nothing, and asks again
 * next week.
 */
export async function decideFeeChange(input: {
  requestId: string;
  approve: boolean;
  reason?: string;
}): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };

  const id = String(input?.requestId ?? "").trim();
  if (!id) return { ok: false, error: "Invalid input" };

  const approve = input?.approve === true;
  const reason = String(input?.reason ?? "").trim();
  if (!approve && reason.length < 3) {
    return { ok: false, error: "Say why not — they will read this." };
  }

  const { error } = await auth.ctx.supabase.rpc("fee_change_decide", {
    p_request_id: id,
    p_approve: approve,
    p_reason: reason || null,
  });
  if (error) {
    if ((error as { code?: string }).code === "42P01") {
      return {
        ok: false,
        error:
          "The place to keep this is not set up yet. Ask us to run the migration, then try again.",
      };
    }
    return { ok: false, error: safeErrorMessage(error) };
  }

  return { ok: true, data: null };
}
