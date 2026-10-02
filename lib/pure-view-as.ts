// ── VIEW AS CUSTOMER: WHAT MAY LEAVE THE BROWSER ───────────────────
//
// De eigenaar, 02-10: "hoe kan ik de acc viewen als een advertiser ...
// somehow we need this, otherwise we cannot see all the bugs". Not the
// customer's password and not a login-as: an owner opens
// /view-as/PSM00xx in their OWN session and sees the customer's screens.
//
// Read-only is enforced at the TRANSPORT, not per button. The customer
// app has dozens of buttons and new ones arrive every week; a list of
// "disable this one in view mode" is out of date the day after it is
// written. Every write in this app leaves the browser as a request that
// is not a GET:
//
//   * a server action  -- POST to the page with a Next-Action header;
//   * a Supabase RPC   -- POST to /rest/v1/rpc/...;
//   * a table write    -- POST / PATCH / DELETE to /rest/v1/...;
//   * an /api route    -- POST.
//
// So in view mode only GET and HEAD go out, plus the two POSTs that do
// not change anything: the session refresh (without it the owner is
// signed out after an hour) and the signed URL for a payment slip. The
// owner can still OPEN every dialog -- which is the point, half the bugs
// live in dialogs -- and the moment one tries to save, it is refused.
//
// The server refuses too (middleware.ts): this file is the polite half.

/** Paths a POST may go to while viewing. Matched on the pathname only. */
const ALLOWED_POSTS = [
  // Supabase session refresh. Changes the OWNER's session, nothing else.
  /\/auth\/v1\/token$/,
  // A signed, time-limited URL to look at a slip. Reads.
  /^\/api\/payment-slip-url$/,
  // The shared exchange-rate refresh. Fired quietly on load when the
  // rate is older than 15 minutes; it touches the one global rate table,
  // nothing of the customer, and blocking it put a "Read-only" toast on
  // the screen before the owner had pressed anything.
  /^\/api\/exchange-rates\/refresh$/,
  // A crash report from the error boundary. Logs, changes nothing.
  /^\/api\/log\/client-error$/,
  // The view log itself (one row per screen opened).
  /^\/api\/view-as\/log$/,
];

/** True when this request must NOT be sent in view mode. */
export function isBlockedInViewMode(method: string | undefined, url: string): boolean {
  const m = (method ?? "GET").toUpperCase();
  if (m === "GET" || m === "HEAD" || m === "OPTIONS") return false;
  let path: string;
  try {
    path = new URL(url, "https://app.invalid").pathname;
  } catch {
    return true; // cannot tell what it is: refuse
  }
  if (m === "POST" && ALLOWED_POSTS.some((re) => re.test(path))) return false;
  return true;
}

/** A client code as it may appear in the URL: PSM followed by digits. */
export function parseViewAsCode(raw: string | undefined | null): string | null {
  const c = String(raw ?? "").trim().toUpperCase();
  return /^PSM\d{2,8}$/.test(c) ? c : null;
}

/** True for a path inside view mode. Server actions POST to the page
 *  itself, so middleware refuses every POST under this prefix. */
export function isViewAsPath(pathname: string): boolean {
  return pathname === "/view-as" || pathname.startsWith("/view-as/");
}

export const VIEW_AS_REFUSAL =
  "Read-only: you are viewing a customer's account. Nothing was changed.";
