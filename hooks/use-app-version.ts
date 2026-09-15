"use client";

import { useQuery } from "@tanstack/react-query";
import { useRef } from "react";

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls /api/version once a minute and returns true once the deploy
 * identifier differs from the one we booted with — meaning a new
 * version has been rolled out while the user has this tab open.
 *
 * The caller decides how to surface the mismatch. A subtle banner
 * with a "reload" button is usually enough; hard-reloading behind
 * the user's back would drop typed input and defeat the purpose.
 *
 * Runs through react-query so that mounting it in more than one place
 * costs one poll, not one poll each: measured on a cold dashboard load,
 * /api/version was fetched twice at ~1.0s apiece while the page was still
 * assembling. The boot version is captured in a ref on first success, so it
 * survives the refetches that later detect the change.
 */
export function useAppVersion(): {
  bootVersion: string | null;
  currentVersion: string | null;
  outdated: boolean;
  reload: () => void;
} {
  const bootRef = useRef<string | null>(null);

  const { data } = useQuery({
    queryKey: ["app-version"],
    queryFn: async () => {
      const res = await fetch("/api/version", { cache: "no-store" });
      if (!res.ok) return null;
      const body = (await res.json()) as { version?: string };
      return body.version ?? null;
    },
    refetchInterval: POLL_INTERVAL_MS,
    staleTime: POLL_INTERVAL_MS,
    retry: false,
    // A version probe that fails is not something the user can act on.
    meta: { silent: true },
  });

  const currentVersion = data ?? null;
  if (currentVersion && bootRef.current === null) {
    bootRef.current = currentVersion;
  }
  const bootVersion = bootRef.current;

  return {
    bootVersion,
    currentVersion,
    outdated:
      !!bootVersion && !!currentVersion && bootVersion !== currentVersion,
    reload: () => {
      if (typeof window !== "undefined") window.location.reload();
    },
  };
}
