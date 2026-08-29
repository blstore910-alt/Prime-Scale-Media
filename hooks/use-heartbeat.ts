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
export function useHeartbeat() {
  useEffect(() => {
    let intervalId: ReturnType<typeof setInterval> | null = null;

    async function beat() {
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
      beat(); // fire once immediately
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
