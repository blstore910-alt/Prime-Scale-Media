"use server";

import { createAdminClient } from "@/lib/supabase/server";
import { safeErrorMessage } from "@/lib/pure-error";
// A "use server" file may export only async functions -- 2026-09-22 two
// deploys failed on exactly that, with a green tsc/lint/test gate. So the
// constants live in lib, where the card reads them too.
import { MAX_PAYOUT_MIN } from "@/lib/pure-payout-min";
import {
  type ActionResult,
  resolveOwnerContext,
  versionMatches,
} from "./_shared";

/** Postgres: column does not exist. Plak 98 adds it. */
const MISSING_COLUMN = "42703";

/**
 * Release the payout floor for ONE affiliate.
 *
 * The owner, 22-09: "200 usd of 200 eur ondergrens" — per transfer, per
 * currency. The owner, 25-09: "ik wil pas payout vanaf 200 eu, of tenzij
 * admin het vrijgeeft, super admin".
 *
 * So the rule itself does not move. This is the exception to it, per
 * affiliate, and only the account owner can set one: it decides when
 * money leaves the company, which is not an employee admin's call. It is
 * the same line `saveCommissionRules` sits on, and for the same reason.
 *
 * `null` puts them back on the standing 200. `0` means no floor at all
 * for this one affiliate.
 *
 * The floor is enforced in `affiliate_payout_request_multi`, which reads
 * this same column — so nothing here is the last word. This only moves
 * the number the RPC will read.
 *
 * ── WHY THE SERVICE KEY, AND WHY THAT IS NOT A HOLE ──────────────────
 *
 * `advertisers` carries `a0_guard_advertisers_session_write`, a trigger
 * whose allowlist is startup_fee, fee_status, airtable, note, the four
 * commission_* columns and updated_at. Anything else written while
 * `current_user = 'authenticated'` is refused with 42501 — which is the
 * whole point of it, and it does not know who the owner is. So the first
 * version of this action could not save for ANYBODY, owner included.
 *
 * Writing with the service key steps past that trigger, exactly as
 * `payout-details-actions.ts` does for the sibling column. What still
 * stops everyone else is not weakened by it:
 *
 *   - an employee admin calling this action      -> resolveOwnerContext
 *   - an employee admin PATCHing over PostgREST  -> that same trigger,
 *     because the column is deliberately NOT added to its allowlist
 *   - a customer                                 -> RLS has no UPDATE
 *     policy for them on this table, and the trigger on top of that
 */
export async function setAffiliatePayoutMinimum(input: {
  affiliateAdvertiserId: string;
  minimum: number | null;
  /** What the caller last saw, so two owners cannot overwrite blind. */
  ifUpdatedAt?: string | null;
}): Promise<ActionResult<{ minimum: number | null }>> {
  const auth = await resolveOwnerContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  const id = String(input?.affiliateAdvertiserId ?? "").trim();
  if (!id) return { ok: false, error: "No affiliate was named." };

  // ── WHAT IS BEING SET ────────────────────────────────────────────
  //
  // A blank box is "back to the standing rule", which is NOT the same
  // as zero — zero is "this one may ask for any amount". Those two
  // could not be told apart if the caller sent a number either way, so
  // the null is carried all the way through.
  let minimum: number | null = null;
  if (input?.minimum !== null && input?.minimum !== undefined) {
    const n = Number(input.minimum);
    if (!Number.isFinite(n) || n < 0) {
      return { ok: false, error: "A minimum is zero or more." };
    }
    if (n > MAX_PAYOUT_MIN) {
      return {
        ok: false,
        error: `A minimum above ${MAX_PAYOUT_MIN} is almost certainly a typo.`,
      };
    }
    minimum = Math.round(n * 100) / 100;
  }

  // ── WHOSE ────────────────────────────────────────────────────────
  //
  // Re-fetched server-side and compared here, not trusted from the
  // caller: the id arrives from a browser and one tenant's owner must
  // not be able to move another tenant's floor. Read with the OWNER's
  // session, so RLS is still the thing answering "may you see this".
  const { data: row, error: readErr } = await supabase
    .from("advertisers")
    .select("id, tenant_id, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("setAffiliatePayoutMinimum read", safeErrorMessage(readErr));
    return { ok: false, error: "Could not look that affiliate up." };
  }
  if (!row) return { ok: false, error: "That affiliate no longer exists." };
  const target = row as { tenant_id?: string | null; updated_at?: string | null };
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "That affiliate is not on this account." };
  }
  if (!versionMatches(target.updated_at, input?.ifUpdatedAt)) {
    return {
      ok: false,
      error:
        "Somebody changed this affiliate while you had it open. Reload and look again before you set a minimum.",
    };
  }

  // Column-allowlisted by construction: one named column, one value.
  const admin = await createAdminClient();
  const { data: wrote, error } = await admin
    .from("advertisers")
    .update({ payout_min_override: minimum })
    .eq("id", id)
    // Belt and braces: the id came from a row already matched on the
    // tenant, and the write re-states it.
    .eq("tenant_id", profile.tenant_id)
    .select("id");

  if (error) {
    if ((error as { code?: string }).code === MISSING_COLUMN) {
      return {
        ok: false,
        error:
          "The exception needs plak 98 in the SQL editor first. Nothing was changed.",
      };
    }
    console.error("setAffiliatePayoutMinimum write", safeErrorMessage(error));
    return { ok: false, error: "Could not save it. Nothing was changed." };
  }

  // An UPDATE that matched nothing is not a PostgREST error. Without
  // this the card would say "they can ask from 0" over a row that still
  // says 200 — and on a payout floor, believing it went down when it did
  // not is the wrong direction to be wrong in.
  if (!Array.isArray(wrote) || wrote.length === 0) {
    return {
      ok: false,
      error: "Nothing was changed — that affiliate was not found to write to.",
    };
  }

  return { ok: true, data: { minimum } };
}
