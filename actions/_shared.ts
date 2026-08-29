/**
 * Shared server-action helpers. Not a client-import surface — every file
 * that consumes these is already marked "use server".
 */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "conflict" | "forbidden" | "not_found" | "invalid" };

/**
 * Read-only maintenance mode. When `MAINTENANCE_MODE=true` is set in
 * the server env, every server action calling `assertNotMaintenance()`
 * refuses with a clear error so an incident-response operator can
 * freeze writes without a redeploy.
 *
 * READS are unaffected — page loads, dashboards, and audit_events
 * queries all keep working. This is deliberate: during an incident
 * you want to look at data, you just don't want it changing under you.
 */
export function isMaintenanceMode(): boolean {
  const v = process.env.MAINTENANCE_MODE?.toLowerCase();
  return v === "true" || v === "1" || v === "yes" || v === "on";
}

export function maintenanceGuard():
  | { ok: true }
  | { ok: false; error: string; code: "forbidden" } {
  if (isMaintenanceMode()) {
    return {
      ok: false,
      error:
        "The app is in read-only maintenance mode. Try again in a few minutes.",
      code: "forbidden",
    };
  }
  return { ok: true };
}

/**
 * Optimistic-concurrency guard. Compares the caller-supplied `updated_at`
 * against the row we just fetched under the caller's own read. If they
 * differ, the row has been modified by someone else between the moment
 * the caller loaded the form and the moment they clicked save.
 *
 * Callers pass the value they saw in the UI as `ifUpdatedAt`; the server
 * refuses the write with `code: "conflict"` so the client can re-fetch
 * and prompt the user to reconcile instead of silently overwriting.
 *
 * `ifUpdatedAt` is optional — pass `undefined` to skip the check
 * (needed for flows that don't yet track versions).
 */
export function versionMatches(
  existingUpdatedAt: string | null | undefined,
  ifUpdatedAt: string | null | undefined,
): boolean {
  if (ifUpdatedAt == null) return true;
  if (existingUpdatedAt == null) return true;
  // Postgres timestamps come back with sub-second precision; compare as
  // ISO strings after normalising both to millisecond resolution.
  const norm = (v: string) => new Date(v).toISOString();
  try {
    return norm(existingUpdatedAt) === norm(ifUpdatedAt);
  } catch {
    return false;
  }
}
