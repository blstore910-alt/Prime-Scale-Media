"use client";

import { useMaintenanceStatus } from "@/hooks/use-maintenance-status";
import { AlertOctagon } from "lucide-react";

/**
 * Full-width top banner that appears while MAINTENANCE_MODE=true is set
 * on the server. Rendered once at the root of the authenticated app
 * layout.
 *
 * The banner is purely informational — every server action refuses
 * writes on its own. Its job is to explain *why* the user's save just
 * failed with a "forbidden" message.
 */
export default function MaintenanceBanner() {
  const { maintenance } = useMaintenanceStatus();
  if (!maintenance) return null;

  return (
    <div
      role="alert"
      aria-live="polite"
      className="w-full bg-amber-500/95 text-amber-950 border-b border-amber-600 px-4 py-2 flex items-center justify-center gap-2 text-sm font-medium"
    >
      <AlertOctagon className="h-4 w-4 flex-shrink-0" />
      <span>
        The app is in read-only maintenance mode. Any changes you try to
        save will fail. Reading and browsing still works.
      </span>
    </div>
  );
}
