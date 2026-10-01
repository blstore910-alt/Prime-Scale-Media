// ── FILING THE SAME TRANSFER TEN TIMES ───────────────────────────────
//
// The owner, 28-09: "hoe limiteren we mensen met bijv 10x topup te doen
// wallet terwijl ze maar 1x moeten? kunnen we ook melding geven als ze
// weer proberen in 10 min, van: we hebben je topup ontvangen, please
// wait — maar als ze echt een andere willen sturen dan moet dat
// mogelijk zijn, wel limiteren daarna."
//
// Two different people do this and they need opposite answers:
//
//   - somebody who wired once, did not see it land (it cannot land --
//     an admin has to verify it first), and files again. And again.
//     Every one of those is the SAME money, and each costs the desk a
//     row to read and reject.
//   - somebody who really did make a second transfer. That is ordinary
//     and must go through.
//
// You cannot tell them apart from the outside, so do not try. Slow the
// first one down with something they have to read, let the second one
// say so, and keep a real ceiling behind both.
//
// The hard cap on the database is 15 pending per wallet
// (_cap_pending_wallet_topups). That is a runaway guard, not a limit
// anybody meets on purpose -- by the time somebody has filed fifteen
// claims the desk has already lost an hour to them.

/** Inside this window a second claim is almost certainly the same money. */
export const SAME_MONEY_MINUTES = 10;

/**
 * More than this waiting at once and something is wrong -- with the
 * person, the screen, or us.
 *
 * The owner set the number, 28-09: five. The database backstop is the
 * same five (plak 115, down from fifteen), so the app and the trigger
 * refuse at the same point -- and the app gets there first, with a
 * sentence instead of a database error.
 */
export const MAX_PENDING = 5;

export type TopupAgain =
  | { kind: "fine" }
  /** Recent claim: ask them to look at it before adding another. */
  | { kind: "probably-the-same"; minutesAgo: number; pending: number }
  /** Older claims, but several: still allowed, still worth saying. */
  | { kind: "several-waiting"; pending: number }
  /** Too many. This one is refused. */
  | { kind: "too-many"; pending: number };

/**
 * What to say when somebody opens the dialog with claims already
 * waiting.
 *
 * Deliberately NOT a block on the first two: the whole point is that a
 * real second transfer must be possible. Only the ceiling refuses.
 */
export function topupAgain(input: {
  /** created_at of every PENDING claim on this wallet. */
  pendingCreatedAt: (string | null | undefined)[];
  now?: Date;
}): TopupAgain {
  const now = input.now ?? new Date();
  const times = (input.pendingCreatedAt ?? [])
    .map((s) => (s ? new Date(s).getTime() : NaN))
    .filter((t) => Number.isFinite(t));

  const pending = times.length;
  if (pending === 0) return { kind: "fine" };
  if (pending >= MAX_PENDING) return { kind: "too-many", pending };

  const newest = Math.max(...times);
  const minutesAgo = Math.floor((now.getTime() - newest) / 60_000);
  // A clock skewed into the future is not a negative age -- treat
  // anything not in the past as just now.
  const safeMinutes = minutesAgo < 0 ? 0 : minutesAgo;
  if (safeMinutes < SAME_MONEY_MINUTES) {
    return { kind: "probably-the-same", minutesAgo: safeMinutes, pending };
  }
  return { kind: "several-waiting", pending };
}

/** The sentence the customer reads. Written for somebody who is worried. */
export function topupAgainMessage(a: TopupAgain): string | null {
  switch (a.kind) {
    case "fine":
      return null;
    case "probably-the-same":
      return a.minutesAgo < 1
        ? "You filed a top-up a moment ago — no need to send it again. Only carry on for a second, separate transfer."
        : `You filed a top-up ${a.minutesAgo} minute${
            a.minutesAgo === 1 ? "" : "s"
          } ago — no need to send it again. Only carry on for a second, separate transfer.`;
    case "several-waiting":
      return `You have ${a.pending} top-ups waiting to be checked. Only add another for a separate transfer you have made.`;
    case "too-many":
      return `You have ${a.pending} top-ups waiting already. We will get to those first — message us if one of them is wrong and we will sort it out.`;
  }
}

/** Only the ceiling stops them. */
export function topupAgainBlocks(a: TopupAgain): boolean {
  return a.kind === "too-many";
}

/** The two middle cases need a deliberate second press, not a refusal. */
export function topupAgainNeedsConfirm(a: TopupAgain): boolean {
  return a.kind === "probably-the-same" || a.kind === "several-waiting";
}
