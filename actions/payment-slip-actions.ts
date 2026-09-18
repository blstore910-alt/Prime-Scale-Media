"use server";

import { safeErrorMessage } from "@/lib/pure-error";
import { resolveUserContextForRead } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const BUCKET = "wallet_payment_slips";
// Signed URLs are short-lived — long enough for an admin to open the
// slip in the details sheet, short enough that a leaked link expires
// fast. 5 minutes.
const SIGNED_TTL_SECONDS = 300;

// A stored payment_slip is a bucket PATH like
//   wallet-topups/<wallet_id>/<ts>-<name>
// (Historic rows may still hold a full public URL from before the
// private-bucket switch — those are returned as-is so old data still
// renders; new rows are always paths.)
function looksLikePath(value: string): boolean {
  return !/^https?:\/\//i.test(value);
}

// ─────────────────────────────────────────
// getSignedPaymentSlipUrl
// Mints a short-lived signed URL for a stored slip path. RLS on
// storage.objects still gates who can sign — an advertiser only for
// their own wallet's folder, an admin for their tenant's wallets.
// ─────────────────────────────────────────
export async function getSignedPaymentSlipUrl(
  storedValue: string,
): Promise<ActionResult<{ url: string }>> {
  if (typeof storedValue !== "string" || storedValue.length === 0) {
    return { ok: false, error: "No payment slip" };
  }

  // ── A SESSION IS NOT THE SAME AS AN ACCOUNT ─────────────────────────
  //
  // This action had no guard at all: it leaned entirely on the storage
  // policy, and that policy tests `role = 'admin'` and the tenant — it
  // was not touched by the sweep that taught every helper in `public` to
  // reject a deactivated account, because that sweep covered tables and
  // storage.objects is not one of them.
  //
  // So an admin whose access has just been taken away still holds a
  // valid JWT, and every money RPC refuses them while this hands out
  // five-minute signed links to any customer's bank receipt in the
  // tenant — name, IBAN, amount.
  //
  // ...ForRead checks the session, the tenant AND that the account is
  // still active. NOT the maintenance freeze: opening a bank receipt is
  // a read, it cannot make an incident worse, and it is exactly what an
  // admin reaches for while investigating one. _shared.ts states the
  // rule — "during an incident you want to look at data".
  const auth = await resolveUserContextForRead();
  if (!auth.ok) return { ok: false, error: auth.error };

  // Legacy full-URL rows: nothing to sign, hand it back.
  if (!looksLikePath(storedValue)) {
    return { ok: true, data: { url: storedValue } };
  }

  const supabase = auth.ctx.supabase;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storedValue, SIGNED_TTL_SECONDS);

  if (error || !data?.signedUrl) {
    return {
      ok: false,
      error: error ? safeErrorMessage(error) : "Could not sign URL",
    };
  }
  return { ok: true, data: { url: data.signedUrl } };
}
