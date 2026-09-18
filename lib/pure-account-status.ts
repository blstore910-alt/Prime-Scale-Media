/**
 * Is this ad account switched off?
 *
 * The list lived inside one component, and the rule it encodes is needed
 * in at least three places: the card that hides Top up, the sheet that
 * offers Withdraw, and the server action that creates the withdrawal.
 * Two of those did not have it, so a customer could open a disabled
 * account's sheet and withdraw from it — which is the exact thing J8
 * step 1 exists to test.
 *
 * AN UNKNOWN STATUS COUNTS AS LOCKED. A status nobody has taught this
 * app is not a working account; it is a word somebody typed, and the
 * customer should not be invited to move money against it. The only
 * values treated as live are the ones we actually recognise.
 */

/** The statuses that mean money may move on this account. */
export const ACCOUNT_LIVE_STATUSES = ["active", "approved", "live"] as const;

/** Kept for screens that want to name the reason rather than test it. */
export const ACCOUNT_LOCKED_STATUSES = [
  "banned",
  "paused",
  "pending",
  "disabled",
  "suspended",
  "rejected",
  "closed",
] as const;

export function isAccountLocked(status: string | null | undefined): boolean {
  const s = String(status ?? "").trim().toLowerCase();
  // No status at all is not a reason to allow anything.
  if (!s) return true;
  return !(ACCOUNT_LIVE_STATUSES as readonly string[]).includes(s);
}

/** A sentence for the customer, when one is needed. */
export function accountLockedReason(
  status: string | null | undefined,
): string | null {
  if (!isAccountLocked(status)) return null;
  const s = String(status ?? "").trim().toLowerCase();
  if (s === "pending") return "This account is not set up yet.";
  if (s === "banned" || s === "rejected") {
    return "This account was closed by the platform.";
  }
  if (s === "closed") return "This account is closed.";
  if (s === "paused" || s === "suspended" || s === "disabled") {
    return "This account is switched off.";
  }
  return "This account is not active.";
}
