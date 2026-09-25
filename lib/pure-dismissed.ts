/**
 * Notices a customer has waved away.
 *
 * A refused ad-account request puts a card on the Ad accounts screen.
 * That card is news for a day and clutter for a month, and a customer
 * with three refusals behind them opens the screen to a wall of things
 * that already resolved themselves — the fee came back, there is nothing
 * to do. They should be able to push them aside.
 *
 * What is stored is the fact that THIS person, on THIS device, hid a
 * card. It is not a business fact: the request itself, its reason and
 * its refund all stay exactly where they are, on the Requests tab, and
 * nothing here can make a record disappear. That is why it lives in the
 * browser and not behind a server action — see
 * docs/adr/0001-security-defender-rpcs-and-server-actions.md for the
 * line those two sides of sit on.
 *
 * Stored as id -> when it was dismissed, so an entry can age out. A plain
 * list of ids would grow for the lifetime of the account and never shrink.
 */

export type DismissedMap = Record<string, number>;

/** Three months. Long past the 30 days a refusal card renders for. */
export const DISMISS_MAX_AGE_MS = 90 * 86400000;

/** More than this and the oldest go. A key that only grows is a leak. */
export const DISMISS_CAP = 200;

/**
 * Read whatever was in storage. Anything that is not an object of
 * id -> finite number comes back empty rather than throwing: this is a
 * convenience, and a corrupt value must not take the screen down with
 * it.
 */
export function parseDismissed(raw: string | null | undefined): DismissedMap {
  if (!raw) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return {};
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
  const out: DismissedMap = {};
  for (const [id, at] of Object.entries(parsed as Record<string, unknown>)) {
    if (!id) continue;
    const n = Number(at);
    if (Number.isFinite(n) && n > 0) out[id] = n;
  }
  return out;
}

export function serialiseDismissed(map: DismissedMap): string {
  return JSON.stringify(map);
}

export function isDismissed(map: DismissedMap, id: string): boolean {
  return Object.prototype.hasOwnProperty.call(map, id);
}

export function withDismissed(
  map: DismissedMap,
  id: string,
  now = Date.now(),
): DismissedMap {
  if (!id) return map;
  return { ...map, [id]: now };
}

export function withoutDismissed(map: DismissedMap, id: string): DismissedMap {
  if (!isDismissed(map, id)) return map;
  const out = { ...map };
  delete out[id];
  return out;
}

/**
 * Drop what has aged out, then the oldest above the cap.
 *
 * Deliberately NOT pruned against "the ids currently on screen". That
 * list is the result of a query, and a query that failed returns
 * nothing — pruning on it would wipe every dismissal the moment a read
 * broke, and the whole wall would come back. Age and a cap need no read
 * to be right.
 */
export function pruneDismissed(
  map: DismissedMap,
  now = Date.now(),
  maxAgeMs = DISMISS_MAX_AGE_MS,
  cap = DISMISS_CAP,
): DismissedMap {
  const fresh = Object.entries(map).filter(([, at]) => now - at < maxAgeMs);
  fresh.sort((a, b) => b[1] - a[1]);
  return Object.fromEntries(fresh.slice(0, cap));
}
