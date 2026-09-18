import { timingSafeEqual } from "node:crypto";
import type { NextRequest } from "next/server";

/**
 * Who may run a cron route.
 *
 * WHAT WAS WRONG. Both cron routes started with
 *
 *     if (req.headers.get("x-vercel-cron")) return true;
 *
 * — a check on the PRESENCE of a header, with no value compared. A
 * header is supplied by whoever makes the request. `/api/cron/` is a
 * public prefix in the middleware, so nothing asks for a session either.
 * Behind that gate sit the service-role client and
 * `subscription_billing_run()`: invoices raised and wallets auto-debited
 * past their grace period, for every advertiser in every tenant.
 *
 *     curl -H 'x-vercel-cron: 1' https://.../api/cron/subscription-billing
 *
 * was the whole attack, and it is repeatable. Whether it works depends
 * on whether the platform strips inbound `x-vercel-*` headers — which is
 * not a control this application owns, and not one to bet the billing
 * engine on.
 *
 * WHAT IT IS NOW. A shared secret, compared in constant time, and
 * nothing else. If CRON_SECRET is absent the answer is NO — a missing
 * secret means the route is closed, not open. Vercel sends the
 * Authorization header itself when CRON_SECRET is set on the project,
 * so this needs no extra configuration beyond setting it.
 *
 * Constant time because a plain `===` on a secret leaks its length and,
 * character by character, its contents to anyone who can measure. The
 * Wise webhook already does this; the cron routes did not.
 */
export function isCronAuthorised(req: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;

  // Compare equal-length buffers, or timingSafeEqual throws and the
  // throw itself becomes the side channel.
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}
