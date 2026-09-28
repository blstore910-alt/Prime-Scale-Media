"use client";

import { useAppVersion } from "@/hooks/use-app-version";
import { RefreshCw } from "lucide-react";
import { useState } from "react";

/**
 * Fixed-position, low-profile banner that appears when a newer
 * deploy is detected. The user chooses when to reload — we never
 * force it, because that would drop typed input (see the bol-app
 * "deploy tijdens invoer" lesson).
 *
 * Mount once, at the root of the authenticated app layout.
 */
export default function AppVersionBanner() {
  const { outdated, reload } = useAppVersion();
  const [dismissed, setDismissed] = useState(false);

  if (!outdated || dismissed) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      /* On a phone this sat directly on top of the advertiser/affiliate
         bottom nav (which is fixed at bottom:0, ~76px tall) and swallowed
         its taps — you could not navigate until you dismissed it. Lifted
         clear of the bar and given the full width there. */
      /* pointer-events-auto is LOAD-BEARING. Radix sets
         `body { pointer-events: none }` for as long as a modal dialog is
         open, and this banner lives outside that dialog — so while anyone
         had a dialog open (which is exactly when a deploy interrupts them)
         neither the Reload button nor the dismiss X could be clicked at
         all. Nothing looked broken; the clicks simply went nowhere.
         pointer-events is inherited, so restoring it on this element is
         enough. */
      className="pointer-events-auto fixed bottom-4 right-4 z-[60] flex items-center gap-3 rounded-md border bg-card text-card-foreground shadow-lg px-4 py-3 text-sm max-w-sm max-sm:left-4 max-sm:right-4 max-sm:max-w-none max-sm:bottom-[calc(84px+env(safe-area-inset-bottom))]"
    >
      <div className="flex-1">
        <p className="font-medium">New version available</p>
        {/* ── AND THIS SENTENCE WAS THE WRONG ADVICE ─────────────
            "Reload when you're done with what you're doing" assumes
            you can still finish. Walked on production 28-09: once the
            deploy has landed, the chunks this tab has not downloaded
            yet are GONE, so any dialog or handler it still needs is
            inert -- a customer pressed "Yes, send it" and an admin
            pressed "Review" and both got nothing at all, no error.
            So the banner says what is actually true. ChunkReloadGuard
            catches the ones who carry on anyway. */}
        <p className="text-xs text-muted-foreground mt-0.5">
          Buttons and dialogs may stop responding until you reload.
        </p>
      </div>
      {/* Explicit colours, not a variant. This is the one button in the app
          that people meet while running a STALE bundle — that is the whole
          reason the banner is on screen — so it must not depend on a utility
          or a CSS variable that a past or future stylesheet might define
          differently. It was invisible for exactly that reason once already:
          white text on a fill that had been overridden away. */}
      <button
        type="button"
        onClick={reload}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#3a6fff] px-3 py-2 text-sm font-semibold text-white shadow-[0_8px_18px_-10px_rgba(58,111,255,.9)] transition hover:bg-[#2f5ae6] active:translate-y-px"
      >
        <RefreshCw className="h-3.5 w-3.5" />
        Reload
      </button>
      <button
        type="button"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-xl leading-none text-muted-foreground transition hover:bg-black/5 hover:text-foreground active:scale-95"
      >
        ×
      </button>
    </div>
  );
}
