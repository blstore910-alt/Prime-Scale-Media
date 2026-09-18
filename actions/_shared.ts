/**
 * Shared server-action helpers. Not a client-import surface — every file
 * that consumes these is already marked "use server".
 */

export type ActionResult<T = null> =
  // `warning` is for the case where the main write succeeded but a secondary
  // one did not — returning ok:false would be a lie (the thing exists), and
  // swallowing it silently is how a half-applied action looks like a clean
  // one. The caller should surface it.
  | { ok: true; data: T; warning?: string }
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
    .select("id, role, tenant_id, user_id, full_name, email, is_active, status")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false, error: "Forbidden" };

  const chosen = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (chosen.role !== "admin" || !chosen.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  // Deactivated admin keeps role but loses access.
  if (chosen.is_active === false || (chosen.status ?? "active") === "inactive") {
    return { ok: false, error: "Account is inactive" };
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
 * An UPDATE that matches NOTHING is not an error.
 *
 * PostgREST returns no error and no rows, so `const { error } = await
 * supabase.from(t).update(...)` reports success for a write that never
 * happened — which is exactly what RLS refusing the write looks like, and
 * what a row deleted or moved by someone else looks like. The screen then
 * shows a success toast, refetches, and displays the old value; the only
 * clue is that nothing ever changes.
 *
 * Every update that means something should `.select("id")` and pass the rows
 * through here. Thirty call sites in actions/ were written without it.
 */
export function wroteSomething<T>(
  rows: T[] | null | undefined,
): { ok: true } | { ok: false; error: string; code: "forbidden" } {
  if (rows && rows.length > 0) return { ok: true };
  return {
    ok: false,
    error:
      "That change was not saved — the row could not be written. Reload and try again.",
    code: "forbidden",
  };
}

/**
 * The same guard for an action a CUSTOMER performs on their own data.
 *
 * resolveAdminContext() exists for admin actions and refuses anyone who is
 * not an admin. Reaching for it on a customer action is an easy mistake to
 * make — the comment above it is about deactivated admins keeping powers,
 * which reads like it belongs on anything that touches money — and it is a
 * silent one, because the action still compiles, still type-checks, and
 * fails only for the people it is FOR. That is exactly what happened to
 * requestAdAccountWithdrawal: hardened on 2026-09-15, and from that moment
 * no customer could withdraw from an ad account at all.
 *
 * So: same maintenance freeze, same deactivated-account refusal, no role
 * requirement. Ownership is still enforced — by the RPC or by RLS, which is
 * where it belongs for customer data.
 */
export async function resolveUserContext(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; error: string }
> {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };
  return resolveUserContextForRead();
}

/**
 * The same identity resolution, WITHOUT the maintenance freeze.
 *
 * For actions that only read. The rule stated 60 lines up is that "READS
 * are unaffected — page loads, dashboards, and audit_events queries all
 * keep working. This is deliberate: during an incident you want to look
 * at data." Two read-only actions were routed through resolveUserContext
 * anyway, so turning MAINTENANCE_MODE on stopped an admin opening a bank
 * receipt to investigate the incident, and stopped a customer reading
 * their own financial statement — neither of which can make anything
 * worse, and both of which are what you reach for when something has
 * gone wrong.
 *
 * Everything else is identical: the same session, the same profile_id
 * cookie, the same refusal for a deactivated account. A mutation must
 * still use resolveUserContext.
 */
export async function resolveUserContextForRead(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; error: string }
> {
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
    .select("id, role, tenant_id, user_id, full_name, email, is_active, status")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false, error: "Forbidden" };

  const chosen = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (!chosen.tenant_id) return { ok: false, error: "Forbidden" };
  if (chosen.is_active === false || (chosen.status ?? "active") === "inactive") {
    return { ok: false, error: "Account is inactive" };
  }

  return { ok: true, ctx: { supabase, profile: chosen as AdminProfile } };
}

/**
 * The tenant OWNER, not just an admin.
 *
 * Several capabilities are owner-only by design and were enforced ONLY by
 * the settings layout calling requireSuperAdmin — a page guard, which a
 * server action does not go through. So an employee admin could invoke
 * upsertPlan, upsertExchangeRate, upsertFeeDefault or upsertAdAccountType
 * directly and change what every customer is charged, the FX every
 * conversion uses, and the monthly price. The UI said owner-only; nothing
 * behind it agreed.
 *
 * This is the server-side half, mirroring apiRequireOwner for actions.
 * Built on resolveAdminContext, so it inherits the maintenance freeze, the
 * tenant resolution and the deactivated-account check.
 */
export async function resolveOwnerContext(): Promise<
  { ok: true; ctx: AdminContext } | { ok: false; error: string }
> {
  const base = await resolveAdminContext();
  if (!base.ok) return base;
  const { supabase, profile } = base.ctx;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  const ownerId = (tenant as { owner_id?: string | null } | null)?.owner_id;
  if (!ownerId || ownerId !== profile.user_id) {
    return {
      ok: false,
      error: "Only the account owner can change this.",
    };
  }
  return base;
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

/**
 * Optimistic-concurrency guard for actions that don't already fetch
 * `updated_at`. Returns true (proceed) when the caller passed no
 * `ifUpdatedAt`, OR when the row's `updated_at` can't be read — e.g. a table
 * that has no `updated_at` column on this hand-authored DB. That tolerance
 * is deliberate: the separate read must never turn a missing column into a
 * broken mutation. Returns false ONLY when a real `updated_at` was read and
 * it differs from what the caller last saw (a genuine concurrent edit).
 */
export async function checkVersion(
  supabase: SupabaseClient,
  table: string,
  id: string,
  ifUpdatedAt: string | null | undefined,
): Promise<boolean> {
  if (ifUpdatedAt == null) return true;
  const { data } = await supabase
    .from(table)
    .select("updated_at")
    .eq("id", id)
    .maybeSingle();
  return versionMatches(
    (data as { updated_at?: string } | null)?.updated_at,
    ifUpdatedAt,
  );
}
