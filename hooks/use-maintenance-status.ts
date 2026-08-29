"use client";

import { useEffect, useState } from "react";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls /api/health every 30s. Returns true while the server reports
 * MAINTENANCE_MODE=true. The banner it drives is a soft warning — every
 * server action already refuses writes independently, so this is only
 * about telling the user why their save button is failing.
 */
export function useMaintenanceStatus(): { maintenance: boolean } {
  const [maintenance, setMaintenance] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        const data = (await res.json()) as { maintenance?: boolean };
        if (!cancelled) setMaintenance(!!data.maintenance);
      } catch {
        // ignore — leave state as-is
      }
    }
    poll();
    const t = setInterval(poll, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  return { maintenance };
}
