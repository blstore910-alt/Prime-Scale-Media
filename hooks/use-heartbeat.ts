"use client";

import { useEffect } from "react";

const HEARTBEAT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Sends a POST to /api/heartbeat on mount and every 5 minutes while
 * the tab is visible. The server-side RPC throttles to 1 write per
 * 5 minutes per user, so accidental over-firing is a no-op.
 *
 * Pauses the interval when the tab is hidden — no need to record
 * activity when the user isn't there.
 */
const LAST_BEAT_KEY = "psm-last-heartbeat";

// Only actually POST if the last beat was more than ~4.5 min ago.
// The <Heartbeat/> mount point re-mounts on every SPA navigation, so
// without this a user clicking through 20 pages fires 20 heartbeats.
// The server already throttles the write, but this also stops the
// needless requests (and the 429s a fast test run would otherwise
// trip). Persisted so it holds across mounts/navigations.
function beatDue(): boolean {
  try {
    const last = Number(localStorage.getItem(LAST_BEAT_KEY) ?? 0);
    return !Number.isFinite(last) || Date.now() - last > 4.5 * 60 * 1000;
  } catch {
    return true;
  }
}
function markBeat(): void {
  try {
    localStorage.setItem(LAST_BEAT_KEY, String(Date.now()));
  } catch {
    // ignore — best-effort
  }
}

export function useHeartbeat() {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function beat() {
      if (!beatDue()) return;
      markBeat();
      try {
        await fetch("/api/heartbeat", {
          method: "POST",
          cache: "no-store",
          keepalive: true,
        });
      } catch {
        // Silent — heartbeat is best-effort.
      }
    }

    function start() {
      if (intervalId) return;
      beat(); // fire once immediately (throttled)
      intervalId = setInterval(beat, HEARTBEAT_INTERVAL_MS);
    }
    function stop() {
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    }

    function handleVisibility() {
      if (document.visibilityState === "visible") start();
      else stop();
    }

    start();
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      stop();
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);
}
