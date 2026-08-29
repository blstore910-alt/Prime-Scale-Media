"use client";

import { useEffect, useRef, useState } from "react";

const POLL_INTERVAL_MS = 60_000;

/**
 * Polls /api/version once a minute and returns true once the deploy
 * identifier differs from the one we booted with — meaning a new
 * version has been rolled out while the user has this tab open.
 *
 * The caller decides how to surface the mismatch. A subtle banner
 * with a "reload" button is usually enough; hard-reloading behind
 * the user's back would drop typed input and defeat the purpose.
 */
export function useAppVersion(): {
  bootVersion: string | null;
  currentVersion: string | null;
  outdated: boolean;
  reload: () => void;
} {
  const [bootVersion, setBootVersion] = useState<string | null>(null);
  const [currentVersion, setCurrentVersion] = useState<string | null>(null);
  const bootRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function fetchVersion(): Promise<string | null> {
      try {
        const res = await fetch("/api/version", { cache: "no-store" });
        if (!res.ok) return null;
        const data = (await res.json()) as { version?: string };
        return data.version ?? null;
      } catch {
        return null;
      }
    }

    // Boot
    (async () => {
      const v = await fetchVersion();
      if (cancelled) return;
      bootRef.current = v;
      setBootVersion(v);
      setCurrentVersion(v);
    })();

    // Poll
    const timer = setInterval(async () => {
      const v = await fetchVersion();
      if (cancelled) return;
      if (v) setCurrentVersion(v);
    }, POLL_INTERVAL_MS);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

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
