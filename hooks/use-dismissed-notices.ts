"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  type DismissedMap,
  isDismissed,
  parseDismissed,
  pruneDismissed,
  serialiseDismissed,
  withDismissed,
  withoutDismissed,
} from "@/lib/pure-dismissed";

/**
 * Cards a customer has pushed aside, remembered across reloads.
 *
 * Scoped by user: two people on one machine do not inherit each other's
 * dismissals. Every touch of localStorage is wrapped — a private window,
 * blocked site data or a full quota throws on read AND on write, and the
 * screen must render identically when it does. The worst case is that a
 * dismissal does not stick, which is the behaviour we had before.
 *
 * Starts EMPTY on the server and on the first client render, then fills
 * in from storage in an effect. Reading localStorage during render is a
 * hydration mismatch — the server has no such thing.
 */
export function useDismissedNotices(formKey: string, userScope?: string | null) {
  const storageKey = `psm.dismissed.${formKey}.${userScope ?? "anon"}`;
  const [map, setMap] = useState<DismissedMap>({});

  useEffect(() => {
    let next: DismissedMap = {};
    try {
      next = pruneDismissed(parseDismissed(window.localStorage.getItem(storageKey)));
    } catch {
      next = {};
    }
    setMap(next);
  }, [storageKey]);

  const persist = useCallback(
    (next: DismissedMap) => {
      setMap(next);
      try {
        window.localStorage.setItem(storageKey, serialiseDismissed(next));
      } catch {
        // Nothing to do and nothing to say: the card still closes for
        // this visit, it just will not stay closed after a reload.
      }
    },
    [storageKey],
  );

  const dismiss = useCallback(
    (id: string) => persist(pruneDismissed(withDismissed(map, id))),
    [map, persist],
  );

  const restoreAll = useCallback(() => persist({}), [persist]);

  const restore = useCallback(
    (id: string) => persist(withoutDismissed(map, id)),
    [map, persist],
  );

  return useMemo(
    () => ({
      hidden: (id: string) => isDismissed(map, id),
      /** How many of THESE ids are hidden — not how many are stored. */
      hiddenCount: (ids: string[]) => ids.filter((id) => isDismissed(map, id)).length,
      dismiss,
      restore,
      restoreAll,
    }),
    [map, dismiss, restore, restoreAll],
  );
}
