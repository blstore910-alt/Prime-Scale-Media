import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { cache } from "react";
import type { User } from "@supabase/supabase-js";

type AdminProfile = {
  id: string;
  role: string;
  tenant_id: string | null;
  user_id: string;
  is_active?: boolean;
  status?: string;
};

type Resolution =
  | { kind: "ok"; profile: AdminProfile; user: User }
  | { kind: "unauthorized" }
  | { kind: "no-profile" }
  | { kind: "forbidden" }
  | { kind: "inactive" };

const DENIALS: Record<string, { message: string; status: number }> = {
  unauthorized: { message: "Unauthorized", status: 401 },
  "no-profile": { message: "Profile not found", status: 403 },
  forbidden: { message: "Forbidden", status: 403 },
  inactive: { message: "Account inactive", status: 403 },
};

// Deduplicated per request. Every call costs two serial network round trips
// to Supabase — auth.getUser() validates the JWT with the auth server, then
// the profile row is read — before any endpoint does its own work. That is
// fine once; the batch endpoint calls eight handlers inside ONE request, and
// without this each of them would pay it again.
//
// cache() is per-request by construction, so this can never serve one user's
// profile to another: a new request gets a new cache.
const resolveAdmin = cache(async (): Promise<Resolution> => {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) return { kind: "unauthorized" };

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id, is_active, status")
    .eq("user_id", userData.user.id);

  if (profileError || !profiles?.length) return { kind: "no-profile" };

  const list = profiles as AdminProfile[];
  const profile = existingProfile
    ? list.find((p) => p.id === existingProfile) ?? list[0]
    : list[0];

  if (profile.role !== "admin" || !profile.tenant_id) {
    return { kind: "forbidden" };
  }
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { kind: "inactive" };
  }

  return { kind: "ok", profile, user: userData.user };
});

export async function apiRequireAdmin() {
  const resolved = await resolveAdmin();

  if (resolved.kind === "ok") {
    return { error: null, profile: resolved.profile, user: resolved.user };
  }

  // A NextResponse body can only be read once, so the denial is built fresh
  // per call — caching the Response itself would break the second reader.
  const denial = DENIALS[resolved.kind];
  return {
    error: NextResponse.json({ error: denial.message }, { status: denial.status }),
    profile: null,
    user: null,
  };
}

/**
 * Owner only — an admin whose user IS the tenant's owner.
 *
 * Some figures are the operator's own business rather than the desk's:
 * profit, margin, what we pay affiliates. Those surfaces are already
 * owner-gated in the UI — /reconciliation calls requireSuperAdmin, and the
 * profit hero renders only on the super-admin branch of the dashboard — but
 * the API routes behind them only ever checked "is an admin". A nav link
 * that is not rendered is not a permission: any admin could read the
 * numbers by asking for them.
 *
 * Built on apiRequireAdmin, so it inherits the active-account check too.
 */
export async function apiRequireOwner() {
  const base = await apiRequireAdmin();
  if (base.error) return base;

  const supabase = await createClient();
  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", base.profile!.tenant_id)
    .maybeSingle();

  const ownerId = (tenant as { owner_id: string | null } | null)?.owner_id;
  const isOwner =
    !!ownerId &&
    (ownerId === base.user!.id || ownerId === base.profile!.user_id);

  if (!isOwner) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      profile: null,
      user: null,
    };
  }
  return base;
}
