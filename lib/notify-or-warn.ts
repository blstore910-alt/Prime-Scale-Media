import type { SupabaseClient } from "@supabase/supabase-js";

import { notifyAdvertiser, type AdvertiserNotice } from "@/lib/notify-advertiser";
import { safeErrorMessage } from "@/lib/pure-error";

/**
 * Tell the customer, and say so when we could not.
 *
 * WHY THIS EXISTS. `notifyAdvertiser` has returned `{ ok, why }` since it
 * was written, for every way a customer can fail to be told. Six decision
 * paths on the admin queues `await`ed it and threw the answer away:
 *
 *   approveWalletAdjustment / rejectWalletAdjustment
 *   approveWalletRefund     / rejectWalletRefund
 *   approveAdAccountWithdrawal / rejectAdAccountWithdrawal
 *   rejectAdAccountRequest
 *   notifyTopupRejected's caller, behind a bare `catch {}`
 *
 * Measured on production, 2026-09-23: a wallet adjustment of EUR 10 was
 * approved through the app at 11:19:07 — audited, with an actor, on a row
 * with an advertiser who has a sign-in — and there is NO `wallet_adjusted`
 * notification row for it. The admin saw "Adjustment approved — wallet
 * updated" in green. The customer's balance moved by EUR 10 for a reason
 * only we can see, and nothing anywhere said they had not been told.
 *
 * The money has already moved when this runs, so a failure here is not a
 * failed action — returning `ok:false` would claim the write did not
 * happen. It is a `warning`, which `ActionResult` already carries and
 * `toastResult` already renders as a 15-second amber toast.
 *
 * `readError` is the other half. Every one of those call sites re-reads
 * the row first and destructures `data` only, so a read that FAILED became
 * "this row has no advertiser" and skipped the notification in silence.
 */
export async function notifyOrWarn(
  supabase: SupabaseClient,
  args: {
    advertiserId: string | null | undefined;
    tenantId: string | null | undefined;
    type: AdvertiserNotice;
    payload: Record<string, unknown>;
  },
  /** The error from re-reading the row, if that read was the source. */
  readError?: { message?: string } | null,
  /** What the row is called in the sentence the admin reads. */
  what = "the customer",
): Promise<string | undefined> {
  let why: string | null = null;
  if (readError) {
    why = `we couldn't read the row back (${safeErrorMessage(readError)})`;
  } else if (!args.advertiserId) {
    why = "there is no advertiser on it";
  } else {
    try {
      const sent = await notifyAdvertiser(supabase, args);
      if (!sent.ok) why = sent.why ?? "unknown";
    } catch (e) {
      why = e instanceof Error ? e.message : "unknown";
    }
  }
  if (!why) return undefined;
  return `${what === "the customer" ? "The customer" : what} was NOT notified: ${why}. Tell them by hand.`;
}
