/**
 * Whether a freshly fetched exchange rate may replace the stored one.
 *
 * The only check before this was `0 < rate < 1000`
 * (actions/exchange-rate-actions.ts). That passes an INVERTED rate as
 * easily as a correct one: 1 USD = 0.872361 EUR and its upside-down twin
 * 1.146 both sit comfortably inside the bounds, and the second one makes
 * every conversion in the app a third out.
 *
 * With an hourly job there are 24 chances a day for a bad value to land
 * instead of one every few weeks, so the band matters more, not less.
 * A real EUR/USD move inside an hour is a fraction of a percent; a move
 * of several percent is a story on the news, and on a day like that a
 * human should look before the app re-prices everything.
 *
 * Refusing keeps the PREVIOUS rate, which is a known number that was
 * right an hour ago. That is the safe direction: a slightly stale rate
 * costs cents, a wrong one costs a third of every conversion.
 */

/** A move bigger than this is not applied without a human. */
export const MAX_RATE_MOVE_PCT = 5;

/** Same bounds the settings screen has always used. */
export const RATE_MIN = 0;
export const RATE_MAX = 1000;

export type RateVerdict =
  | { ok: true; movePct: number | null; reason: null }
  | { ok: false; movePct: number | null; reason: string };

export function rateMoveVerdict(
  previous: number | string | null | undefined,
  next: number | string | null | undefined,
  maxPct: number = MAX_RATE_MOVE_PCT,
): RateVerdict {
  const to = Number(next);
  if (!Number.isFinite(to) || to <= RATE_MIN || to >= RATE_MAX) {
    return {
      ok: false,
      movePct: null,
      reason: `not a usable rate (${String(next)})`,
    };
  }

  const from = Number(previous);
  // Nothing stored yet: there is nothing to compare against, and refusing
  // would leave the tenant with no rate at all — which every money path
  // already refuses on. Take it.
  if (previous === null || previous === undefined || !Number.isFinite(from) || from <= 0) {
    return { ok: true, movePct: null, reason: null };
  }

  const movePct = Math.abs((to - from) / from) * 100;
  if (movePct > maxPct) {
    return {
      ok: false,
      movePct,
      reason: `moved ${movePct.toFixed(2)}% (${from} to ${to}), more than the ${maxPct}% we apply without a human`,
    };
  }
  return { ok: true, movePct, reason: null };
}

/**
 * How old the stored rate is, in words, and whether that is a problem.
 *
 * The hourly job can stop — a provider that starts refusing, a schedule
 * that does not fire — and on 27-09 it did exactly that: it ran once at
 * 08:00 and not again, and the only way anyone found out was by reading
 * `updated_at` by hand. A warning that lives inside the job cannot
 * report the job not running, so this one lives on the screen.
 */

/** Past this, the figure on screen deserves a second look. */
export const RATE_STALE_HOURS = 6;

export type RateAge = {
  /** "updated 14 minutes ago", or null when there is nothing to date. */
  text: string | null;
  /** Old enough that the owner should know. */
  stale: boolean;
  hours: number | null;
};

export function rateAge(
  updatedAt: string | null | undefined,
  now: Date = new Date(),
): RateAge {
  if (!updatedAt) return { text: null, stale: false, hours: null };
  const then = new Date(updatedAt).getTime();
  if (!Number.isFinite(then)) return { text: null, stale: false, hours: null };

  const mins = Math.floor((now.getTime() - then) / 60000);
  // A clock that disagrees is not a fresh rate. Treat the future as
  // unknown rather than as "updated in 0 minutes".
  if (mins < 0) return { text: null, stale: false, hours: null };

  const hours = mins / 60;
  const text =
    mins < 1
      ? "updated just now"
      : mins < 60
        ? `updated ${mins} minute${mins === 1 ? "" : "s"} ago`
        : hours < 48
          ? `updated ${Math.floor(hours)} hour${Math.floor(hours) === 1 ? "" : "s"} ago`
          : `updated ${Math.floor(hours / 24)} days ago`;

  return { text, stale: hours >= RATE_STALE_HOURS, hours };
}
