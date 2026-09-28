// ── ASKING FOR THE SAME AD ACCOUNT TWICE ─────────────────────────────
//
// The twin of lib/pure-topup-again.ts, found on the request journey,
// 28-09. The wallet dialog now says "we already have a top-up from you"
// before somebody files the same transfer again; the ad-account request
// form said nothing at all, and there each duplicate is worse:
//
//   - EUR 50 leaves the wallet the moment it is sent, per request. Two
//     of the same thing is EUR 100 gone and a refund to chase.
//   - it eats the plan's included-accounts allowance, so the SECOND
//     real account they wanted is the one that gets charged.
//
// And the reason people do it is built into the screen: an approved
// request does not become an account by itself -- somebody here picks
// it up. So nothing visibly happens for hours, and a customer who is
// not sure it went through files it again.
//
// WHAT THIS DELIBERATELY DOES NOT DO
//
// It does not refuse. Requesting several accounts at once is ordinary
// work for somebody scaling up, and there are already two real ceilings
// on this journey: the wallet balance, and the plan allowance that
// decides what is free. A count-based refusal on top of those would
// stop a paying customer from spending money with us, to save them from
// a mistake they can also simply not make. So: say it plainly, make
// them press again on purpose, and let them through.

/** Inside this window, the same platform and currency is almost certainly a repeat. */
export const SAME_REQUEST_MINUTES = 30;

/**
 * The database's OWN twin guard, in seconds.
 *
 * `_no_twin_ad_account_request` refuses an insert outright when the
 * same advertiser already has a pending request with the same platform
 * and currency created in the last 90 seconds, with errcode 23505 --
 * which PostgREST returns as a 409.
 *
 * Walked on production, 28-09: the dialog said "Only carry on if you
 * really want a second account", the customer carried on, and the
 * server refused. The screen invited an action the database had
 * already decided against. Whatever the client says has to agree with
 * that, so the two numbers live next to each other.
 */
export const SERVER_TWIN_SECONDS = 90;

export type OpenRequest = {
  createdAt: string | null | undefined;
  platform: string | null | undefined;
  currency: string | null | undefined;
};

export type RequestAgain =
  | { kind: "fine" }
  /** The database will refuse this one. Say so instead of offering to send it. */
  | { kind: "too-soon"; secondsAgo: number; open: number }
  /** Same platform + currency, filed minutes ago. Almost certainly a repeat. */
  | { kind: "probably-the-same"; minutesAgo: number; open: number }
  /** Other requests are open, but not the same shape. Worth saying, no more. */
  | { kind: "several-open"; open: number };

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();

/**
 * What to say when somebody is about to send a request with others
 * already waiting.
 *
 * `open` is the requests that have NOT turned into an account and have
 * not been refused — the same set the fee preview counts against the
 * plan allowance, so the two numbers on screen cannot disagree.
 */
export function requestAgain(input: {
  open: OpenRequest[];
  /** What they are about to send. */
  platform: string | null | undefined;
  currency: string | null | undefined;
  now?: Date;
}): RequestAgain {
  const now = (input.now ?? new Date()).getTime();
  const open = input.open ?? [];
  if (open.length === 0) return { kind: "fine" };

  const wantP = norm(input.platform);
  const wantC = norm(input.currency);

  let bestSeconds: number | null = null;
  for (const r of open) {
    if (norm(r.platform) !== wantP || norm(r.currency) !== wantC) continue;
    const t = r.createdAt ? new Date(r.createdAt).getTime() : NaN;
    if (!Number.isFinite(t)) continue;
    // A clock skewed into the future is not a negative age.
    const secs = Math.max(0, Math.floor((now - t) / 1000));
    if (bestSeconds === null || secs < bestSeconds) bestSeconds = secs;
  }

  if (bestSeconds !== null) {
    // The database's window first: inside it there is nothing to decide,
    // because the insert cannot succeed.
    if (bestSeconds < SERVER_TWIN_SECONDS) {
      return { kind: "too-soon", secondsAgo: bestSeconds, open: open.length };
    }
    const mins = Math.floor(bestSeconds / 60);
    if (mins < SAME_REQUEST_MINUTES) {
      return { kind: "probably-the-same", minutesAgo: mins, open: open.length };
    }
  }
  return { kind: "several-open", open: open.length };
}

/** The sentence the customer reads. Written for somebody who is unsure, not careless. */
export function requestAgainMessage(a: RequestAgain): string | null {
  switch (a.kind) {
    case "fine":
      return null;
    case "too-soon": {
      const wait = Math.max(1, SERVER_TWIN_SECONDS - a.secondsAgo);
      return `You sent a request exactly like this one seconds ago, and we won't take a second one this quickly — it is almost always the same click twice. Wait about ${wait} second${
        wait === 1 ? "" : "s"
      } if you really do want another account.`;
    }
    case "probably-the-same": {
      const when =
        a.minutesAgo < 1
          ? "a moment ago"
          : `${a.minutesAgo} minute${a.minutesAgo === 1 ? "" : "s"} ago`;
      return `You asked for an account just like this ${when} and it is still with us. Requests are set up by hand, so there is nothing to see yet — you do not need to send it again. Only carry on if you really want a second account.`;
    }
    case "several-open":
      return `You have ${a.open} request${
        a.open === 1 ? "" : "s"
      } with us already. Only send another if you want another account.`;
  }
}

/**
 * The one case that really is a refusal -- because the database has
 * already made it one. Everything else warns and lets them through.
 */
export function requestAgainBlocks(a: RequestAgain): boolean {
  return a.kind === "too-soon";
}

/** The warning cases need a deliberate second press. "too-soon" is not one. */
export function requestAgainNeedsConfirm(a: RequestAgain): boolean {
  return a.kind === "probably-the-same" || a.kind === "several-open";
}
