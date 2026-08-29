"use client";

import { useEffect } from "react";

/**
 * Trigger the browser's built-in "leave this page?" dialog when the
 * user closes the tab, refreshes, or navigates away while `dirty` is
 * true.
 *
 * Doesn't cover React-router style pushState navigation — for that
 * combine with a router guard. Covers the two most common data-loss
 * paths (close tab, close browser) which is 80% of the risk.
 *
 * Combined with the IndexedDB draft persistence, the user has three
 * layers: dialog warning → IDB draft on next visit → server-side
 * fallback if they submitted a partial write.
 */
export function useUnsavedChangesWarning(dirty: boolean, enabled = true) {
  useEffect(() => {
    if (!enabled || !dirty) return;

    const handler = (e: BeforeUnloadEvent) => {
      // Modern browsers ignore the custom message and show their own,
      // but preventDefault + returnValue is still required to trigger
      // the confirmation at all.
      e.preventDefault();
      e.returnValue = "";
    };

    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, enabled]);
}
