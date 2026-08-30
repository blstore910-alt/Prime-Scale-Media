"use client";

import { useEffect, useRef, useState } from "react";

const ACTIVITY_EVENTS = [
  "mousedown",
  "keydown",
  "touchstart",
  "scroll",
] as const;

/**
 * Track wall-clock inactivity and fire callbacks at two thresholds:
 *   - warnAfterMs   : show a "you'll be signed out" dialog
 *   - timeoutAfterMs: actually sign the user out
 *
 * Any pointer / key / scroll event resets the counter (throttled to
 * once per second — a hot mouse-move doesn't hammer state). Also
 * resets when the tab regains visibility, so returning from another
 * tab counts as activity.
 */
export function useIdleTimeout(opts: {
  warnAfterMs: number;
  timeoutAfterMs: number;
  onWarn: () => void;
  onTimeout: () => void;
  enabled?: boolean;
}) {
  const { warnAfterMs, timeoutAfterMs, onWarn, onTimeout, enabled = true } =
    opts;
  const [idleSince, setIdleSince] = useState<number>(Date.now());
  const lastResetRef = useRef<number>(Date.now());

  // Throttled activity reset — no need to setState on every mousemove.
  useEffect(() => {
    if (!enabled) return;
    const bump = () => {
      const now = Date.now();
      if (now - lastResetRef.current < 1000) return;
      lastResetRef.current = now;
      setIdleSince(now);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") bump();
    };
    for (const ev of ACTIVITY_EVENTS) {
      window.addEventListener(ev, bump, { passive: true });
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      for (const ev of ACTIVITY_EVENTS) {
        window.removeEventListener(ev, bump);
      }
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [enabled]);

  // Wall-clock ticker — fires the callbacks based on how long we've
  // been idle. Runs on a plain interval; cheap.
  useEffect(() => {
    if (!enabled) return;
    let warnFired = false;
    let timeoutFired = false;
    const tick = setInterval(() => {
      const idleFor = Date.now() - idleSince;
      if (!warnFired && idleFor >= warnAfterMs && idleFor < timeoutAfterMs) {
        warnFired = true;
        onWarn();
      }
      if (!timeoutFired && idleFor >= timeoutAfterMs) {
        timeoutFired = true;
        onTimeout();
      }
    }, 10_000); // check every 10s — precision-friendly for 30-min windows
    return () => clearInterval(tick);
  }, [idleSince, warnAfterMs, timeoutAfterMs, onWarn, onTimeout, enabled]);
}
