"use client";

import { useAppVersion } from "@/hooks/use-app-version";
import { Button } from "@/components/ui/button";
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
      className="fixed bottom-4 right-4 z-50 flex items-center gap-3 rounded-md border bg-card text-card-foreground shadow-lg px-4 py-3 text-sm max-w-sm"
    >
      <div className="flex-1">
        <p className="font-medium">New version available</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Reload when you&apos;re done with what you&apos;re doing.
        </p>
      </div>
      <Button size="sm" onClick={reload}>
        <RefreshCw className="h-3 w-3 mr-1" />
        Reload
      </Button>
      <Button
        size="sm"
        variant="ghost"
        onClick={() => setDismissed(true)}
        aria-label="Dismiss"
      >
        ×
      </Button>
    </div>
  );
}
