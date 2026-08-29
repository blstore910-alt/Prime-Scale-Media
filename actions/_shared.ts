/**
 * Shared server-action helpers. Not a client-import surface — every file
 * that consumes these is already marked "use server".
 */

export type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string; code?: "conflict" | "forbidden" | "not_found" | "invalid" };

/**
 * Shared adminContext resolver.
 *
 * Every mutation-side server action needs the same 4 things:
 * 1. Maintenance-mode guard
 * 2. auth.uid() from the current session
 * 3. Look up the caller's profile (with the currently-active profile
 *    cookie as a tie-breaker for users that admin multiple tenants)
 * 4. Confirm the profile is an admin with a tenant
 *
 * Callers used to duplicate that block. Now they call
 * `resolveAdminContext()` and get a discriminated union back.
 *
 * The concrete Supabase client is created here — safer than passing
 * one in, because we can't accidentally get one from the wrong scope.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export type AdminProfile = {
  id: string;
  role: string;
  tenant_id: string;
  user_id: string;
  full_name?: string | null;
  email?: string | null;
};

export type AdminContext = {
  supabase: SupabaseClient;
  profile: AdminProfile;
};

export async function resolveAdminContext(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; error: string }
> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };

  // Lazy imports so this helper stays usable from tests that mock
  // process env without pulling in next/headers or the Supabase client.
  const { createClient } = await import("@/lib/supabase/server");
  const { cookies } = await import("next/headers");

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Unauthorized" };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id, full_name, email")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false, error: "Forbidden" };

  const chosen = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (chosen.role !== "admin" || !chosen.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  return {
    ok: true,
    ctx: {
      supabase,
      profile: chosen as AdminProfile,
    },
  };
}

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
