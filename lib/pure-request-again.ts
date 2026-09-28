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

export type OpenRequest = {
  createdAt: string | null | undefined;
  platform: string | null | undefined;
  currency: string | null | undefined;
};

export type RequestAgain =
  | { kind: "fine" }
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

  let best: number | null = null;
  for (const r of open) {
    if (norm(r.platform) !== wantP || norm(r.currency) !== wantC) continue;
    const t = r.createdAt ? new Date(r.createdAt).getTime() : NaN;
    if (!Number.isFinite(t)) continue;
    // A clock skewed into the future is not a negative age.
    const mins = Math.max(0, Math.floor((now - t) / 60_000));
    if (mins < SAME_REQUEST_MINUTES && (best === null || mins < best)) {
      best = mins;
    }
  }

  if (best !== null) {
    return { kind: "probably-the-same", minutesAgo: best, open: open.length };
  }
  return { kind: "several-open", open: open.length };
}

/** The sentence the customer reads. Written for somebody who is unsure, not careless. */
export function requestAgainMessage(a: RequestAgain): string | null {
  switch (a.kind) {
    case "fine":
      return null;
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

// There is deliberately no requestAgainBlocks() to match
// topupAgainBlocks(). Nothing on this journey refuses, and a function
// that can only ever answer false would invite a caller to believe a
// ceiling exists here when it does not.

/** Both cases need a deliberate second press, not a refusal. */
export function requestAgainNeedsConfirm(a: RequestAgain): boolean {
  return a.kind !== "fine";
}
