"use server";

import { safeErrorMessage } from "@/lib/pure-error";
// A "use server" file may export only async functions -- 2026-09-22 two
// deploys failed on exactly that, with a green tsc/lint/test gate. So the
// constants live in lib, where the card reads them too.
import { MAX_PAYOUT_MIN } from "@/lib/pure-payout-min";
import { type ActionResult, resolveOwnerContext } from "./_shared";

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
 */
export async function setAffiliatePayoutMinimum(input: {
  affiliateAdvertiserId: string;
  minimum: number | null;
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
  // not be able to move another tenant's floor.
  const { data: row, error: readErr } = await supabase
    .from("advertisers")
    .select("id, tenant_id, tenant_client_code")
    .eq("id", id)
    .maybeSingle();
  if (readErr) {
    console.error("setAffiliatePayoutMinimum read", safeErrorMessage(readErr));
    return { ok: false, error: "Could not look that affiliate up." };
  }
  if (!row) return { ok: false, error: "That affiliate no longer exists." };
  if ((row as { tenant_id?: string | null }).tenant_id !== profile.tenant_id) {
    return { ok: false, error: "That affiliate is not on this account." };
  }

  // Column-allowlisted by construction: one named column, one value.
  const { error } = await supabase
    .from("advertisers")
    .update({ payout_min_override: minimum })
    .eq("id", id)
    .eq("tenant_id", profile.tenant_id);

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

  return { ok: true, data: { minimum } };
}
