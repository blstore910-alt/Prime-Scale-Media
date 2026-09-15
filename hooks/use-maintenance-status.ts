"use client";

import { useQuery } from "@tanstack/react-query";

const POLL_INTERVAL_MS = 30_000;

/**
 * Polls /api/health every 30s. Returns true while the server reports
 * MAINTENANCE_MODE=true. The banner it drives is a soft warning — every
 * server action already refuses writes independently, so this is only
 * about telling the user why their save button is failing.
 *
 * It runs through react-query rather than its own effect + interval because
 * two components use it (the banner and the system-status panel), and two
 * private effects meant two independent polls: /api/health was measured
 * twice on a cold dashboard load at 2.3s and 1.3s, competing with the
 * dashboard's own data for the same connections. One shared query key means
 * one poll no matter how many consumers mount.
 */
export function useMaintenanceStatus(): { maintenance: boolean } {
  const { data } = useQuery({
    queryKey: ["maintenance-status"],
    queryFn: async () => {
      const res = await fetch("/api/health", { cache: "no-store" });
      const body = (await res.json()) as { maintenance?: boolean };
      return !!body.maintenance;
    },
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS,
    // A failed health check is not a maintenance window, and it already
    // surfaces elsewhere — don't let it raise a toast of its own.
    retry: false,
    meta: { silent: true },
  });

  return { maintenance: !!data };
}
