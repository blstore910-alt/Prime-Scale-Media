"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { maintenanceGuard, resolveAdminContext } from "./_shared";
import { resolveUserContextForRead } from "./_shared";

// ── PROOF THAT THE MONEY CAME BACK ──────────────────────────────────
//
// The owner, 27-09: "hier wil ik bewijs zien dat medewerker geld van ad
// account terug heeft gehaald naar ons wallet, dus een screenshot bijv."
//
// Until now the only record was the admin's word. They open the
// supplier's dashboard, pull the money off the ad account, come back and
// press approve, and the customer's wallet is credited. Between those
// two things there was nothing: no figure from the supplier, no time, no
// screen. If a gap turns up later there is no way to tell whether the
// money ever came back.
//
// The column and the bucket come from plak 109. The bucket is private
// and its policies test the ROLE and the TENANT on every row -- no bare
// bucket_id rule, and deliberately no UPDATE and no DELETE, because
// proof that can be overwritten is not proof. A wrong upload becomes a
// second file, not an eraser.

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const BUCKET = "withdrawal_proofs";
// Short-lived, like the payment slips: long enough to look at, short
// enough that a copied link is not a standing door.
const SIGNED_TTL_SECONDS = 300;

/**
 * Record the path of a screenshot an admin has just uploaded.
 *
 * The UPLOAD itself happens from the browser straight to storage, where
 * the bucket policy is the guard. This writes the pointer, and re-checks
 * the tenant while it does — the policy protects the file, this protects
 * the row.
 */
export async function attachWithdrawalProof(
  withdrawalId: string,
  path: string,
): Promise<ActionResult<{ path: string }>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  if (typeof withdrawalId !== "string" || withdrawalId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  const clean = String(path ?? "").trim();
  // The path is minted by the caller, so it is checked rather than
  // trusted: it must sit under this tenant's own folder, which is the
  // same predicate the storage policy enforces.
  if (!clean || clean.includes("..")) {
    return { ok: false, error: "Invalid path" };
  }

  const auth = await resolveAdminContext();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase, profile } = auth.ctx;

  if (!clean.startsWith(`${profile.tenant_id}/`)) {
    return { ok: false, error: "That file does not belong to this account." };
  }

  const { data: row, error: readErr } = await supabase
    .from("ad_account_withdrawals")
    .select("id, tenant_id")
    .eq("id", withdrawalId)
    .maybeSingle();
  if (readErr) return { ok: false, error: safeErrorMessage(readErr) };
  if (!row) return { ok: false, error: "That request no longer exists." };
  if ((row as { tenant_id?: string }).tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const { data: wrote, error: writeErr } = await supabase
    .from("ad_account_withdrawals")
    .update({
      proof_path: clean,
      proof_at: new Date().toISOString(),
      proof_by: profile.user_id,
    })
    .eq("id", withdrawalId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (writeErr) {
    // 42703: plak 109 has not been pasted yet. Say that, rather than
    // handing the person PostgREST's sentence about a column.
    if ((writeErr as { code?: string }).code === "42703") {
      return {
        ok: false,
        error:
          "The place to keep this is not set up yet. Ask us to run the migration, then attach it again.",
      };
    }
    return { ok: false, error: safeErrorMessage(writeErr) };
  }
  // RLS returns zero rows rather than raising, so a refused write looks
  // like a successful one without this.
  if (!wrote || wrote.length === 0) {
    return {
      ok: false,
      error: "That was not saved — you may not have access to this request.",
    };
  }

  return { ok: true, data: { path: clean } };
}

/**
 * A short-lived link to look at one.
 *
 * ...ForRead checks the session, the tenant AND that the account is still
 * active — the same reasoning as the payment slips: a deactivated admin
 * keeps a valid JWT, and every money action refuses them while a signed
 * link would not.
 */
export async function getWithdrawalProofUrl(
  path: string,
): Promise<ActionResult<{ url: string }>> {
  const clean = String(path ?? "").trim();
  if (!clean) return { ok: false, error: "No proof attached" };

  const auth = await resolveUserContextForRead();
  if (!auth.ok) return { ok: false, error: auth.error };

  const { data, error } = await auth.ctx.supabase.storage
    .from(BUCKET)
    .createSignedUrl(clean, SIGNED_TTL_SECONDS);
  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: error ? safeErrorMessage(error) : "Could not open that file",
    };
  }
  return { ok: true, data: { url: data.signedUrl } };
}
