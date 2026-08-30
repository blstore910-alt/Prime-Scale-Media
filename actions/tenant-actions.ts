"use server";

import { createClient } from "@/lib/supabase/server";
import { maintenanceGuard } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─────────────────────────────────────────
// createTenantForCurrentUser
//
// Signed-in user creates their own tenant and becomes its owner + admin
// profile. Refuses if the caller already owns a tenant (prevents unbounded
// tenant spam) and validates the slug shape server-side.
//
// This closes the P0 case where a client insert against `tenants` sets
// owner_id from the browser — RLS is not the only gate any more.
// ─────────────────────────────────────────
// Tenant slugs: 2-40 chars, lowercase alphanumeric, hyphens allowed
// but not at either end. Single-char slugs are refused (too easy to
// confuse with routing).
const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,38}[a-z0-9]$/;
const NAME_MAX = 40;
const NAME_MIN = 2;

export async function createTenantForCurrentUser(input: {
  name: string;
  slug: string;
  initials: string;
}): Promise<ActionResult<{ tenant_id: string }>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const slug = typeof input.slug === "string" ? input.slug.trim().toLowerCase() : "";
  const initials = typeof input.initials === "string" ? input.initials.trim() : "";

  if (name.length < NAME_MIN || name.length > NAME_MAX) {
    return { ok: false, error: "Name must be between 2 and 40 characters" };
  }
  if (!SLUG_RE.test(slug)) {
    return { ok: false, error: "Invalid slug" };
  }
  if (initials.length === 0 || initials.length > 6) {
    return { ok: false, error: "Invalid initials" };
  }

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = userData.user.id;

  // Prevent caller from owning more than one tenant
  const { data: existingOwned } = await supabase
    .from("tenants")
    .select("id")
    .eq("owner_id", userId)
    .limit(1)
    .maybeSingle();
  if (existingOwned) {
    return { ok: false, error: "You already own a tenant" };
  }

  // Slug uniqueness (also enforced by unique index, but check first for a
  // nicer error).
  const { data: slugTaken } = await supabase
    .from("tenants")
    .select("id")
    .eq("slug", slug)
    .maybeSingle();
  if (slugTaken) {
    return { ok: false, error: "Slug already taken" };
  }

  const { data: tenant, error: insertError } = await supabase
    .from("tenants")
    .insert({
      name,
      slug,
      owner_id: userId,
      initials,
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };

  // Also seed the user_profiles row so the caller has a working
  // admin session on this tenant right away. Without this, the
  // /dashboard layout redirects back to /onboard indefinitely.
  const displayName =
    (userData.user.user_metadata?.display_name as string | undefined) ||
    (userData.user.user_metadata?.full_name as string | undefined) ||
    userData.user.email ||
    "Admin";
  const { error: profileError } = await supabase
    .from("user_profiles")
    .insert({
      user_id: userId,
      tenant_id: tenant.id,
      role: "admin",
      full_name: displayName,
      email: userData.user.email,
      status: "active",
      is_active: true,
    });
  if (profileError) {
    // Roll back the tenant so the caller isn't left as owner without
    // a profile (would infinitely-redirect between /dashboard and
    // /onboard).
    await supabase.from("tenants").delete().eq("id", tenant.id);
    return { ok: false, error: profileError.message };
  }

  return { ok: true, data: { tenant_id: tenant.id } };
}
