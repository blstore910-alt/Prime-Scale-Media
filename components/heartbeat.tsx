"use client";

import { useHeartbeat } from "@/hooks/use-heartbeat";

/**
 * Zero-render mount point for the session heartbeat. Rendered once at
 * the root of the authenticated app layout.
 */
export default function Heartbeat() {
  useHeartbeat();
  return null;
}
