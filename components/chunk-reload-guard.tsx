"use client";

import { useEffect } from "react";

import {
  CHUNK_RELOAD_KEY,
  isChunkLoadFailure,
  shouldReloadForChunk,
} from "@/lib/pure-chunk-error";

/**
 * Reloads the page when the JavaScript it needs is no longer on the
 * server.
 *
 * The why is written out in lib/pure-chunk-error.ts: after a deploy,
 * an open tab's lazily loaded chunks are gone, so a dialog that has
 * not been downloaded yet never opens and a handler inside one never
 * runs. Both were walked on production on 28-09 -- a customer pressing
 * "Yes, send it" and an admin pressing "Review" both got silence.
 *
 * AppVersionBanner already offers a reload, and it stays: this is the
 * floor under it, for the person who dismissed it or never saw it.
 *
 * Mount once, beside AppVersionBanner.
 */
export default function ChunkReloadGuard() {
  useEffect(() => {
    // performance.timeOrigin is when THIS document started, so it
    // survives a soft navigation and is not reset by react-query.
    const mountedAt = Date.now();

    const alreadyReloaded = () => {
      try {
        return sessionStorage.getItem(CHUNK_RELOAD_KEY) === "1";
      } catch {
        // Private mode, blocked storage. Better to never reload than
        // to loop, so treat an unreadable flag as "already done".
        return true;
      }
    };

    const markReloaded = () => {
      try {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, "1");
      } catch {
        /* nothing to do -- the guard above already fails closed */
      }
    };

    const act = (err: unknown, url?: string | null) => {
      if (!isChunkLoadFailure(err, url)) return;
      const pageAgeMs =
        typeof performance !== "undefined" && performance.timeOrigin
          ? Date.now() - performance.timeOrigin
          : Date.now() - mountedAt;
      if (!shouldReloadForChunk({ alreadyReloaded: alreadyReloaded(), pageAgeMs })) {
        return;
      }
      markReloaded();
      // location.reload() can be served from the bfcache with the same
      // dead chunk map. Going to the same URL fresh cannot.
      window.location.href = window.location.href;
    };

    const onError = (e: ErrorEvent) => {
      // A <script>/<link> that 404s fires an error event on the element,
      // which arrives here in the capture phase with no `error` object
      // -- only a target carrying the URL.
      const target = e.target as { src?: string; href?: string } | null;
      act(e.error ?? e.message, target?.src ?? target?.href ?? e.filename ?? null);
    };
    const onRejection = (e: PromiseRejectionEvent) => act(e.reason, null);

    // Capture, because a resource error does not bubble.
    window.addEventListener("error", onError, true);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError, true);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
