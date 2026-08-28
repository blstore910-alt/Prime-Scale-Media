"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

type CallerContext = {
  supabase: Awaited<ReturnType<typeof createClient>>;
  profile: {
    id: string;
    role: string;
    tenant_id: string | null;
    user_id: string;
  };
};

async function resolveCaller(): Promise<
  { ok: true; ctx: CallerContext } | { ok: false; error: string; status: number }
> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return { ok: false, error: "Unauthorized", status: 401 };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
    .eq("user_id", userData.user.id);

  if (profileError || !profiles?.length) {
    return { ok: false, error: "Profile not found", status: 403 };
  }

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (!profile.tenant_id) {
    return { ok: false, error: "Tenant missing", status: 403 };
  }

  return { ok: true, ctx: { supabase, profile } };
}

async function assertAdmin() {
  const caller = await resolveCaller();
  if (!caller.ok) return caller;
  if (caller.ctx.profile.role !== "admin") {
    return { ok: false as const, error: "Forbidden", status: 403 };
  }
  return caller;
}

async function assertSuperAdmin() {
  const admin = await assertAdmin();
  if (!admin.ok) return admin;
  const { data: tenant } = await admin.ctx.supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", admin.ctx.profile.tenant_id)
    .maybeSingle();
  const ownerId = tenant?.owner_id ?? null;
  if (!ownerId || ownerId !== admin.ctx.profile.user_id) {
    return { ok: false as const, error: "Forbidden", status: 403 };
  }
  return admin;
}

// ─────────────────────────────────────────
// toggleAdminStatus — super-admin only.
// Verifies target is another admin in the same tenant and is not the caller.
// ─────────────────────────────────────────
export async function toggleAdminStatus(
  adminId: string,
): Promise<ActionResult<{ status: "active" | "inactive" }>> {
  if (typeof adminId !== "string" || adminId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }

  const caller = await assertSuperAdmin();
  if (!caller.ok) return { ok: false, error: caller.error };
  const { supabase, profile } = caller.ctx;

  if (adminId === profile.id) {
    return { ok: false, error: "Cannot toggle your own status" };
  }

  const { data: target, error: fetchError } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, status")
    .eq("id", adminId)
    .maybeSingle();

  if (fetchError || !target) {
    return { ok: false, error: "Admin not found" };
  }
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (target.role !== "admin") {
    return { ok: false, error: "Target is not an admin" };
  }

  const nextStatus = target.status === "active" ? "inactive" : "active";

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update({
      status: nextStatus,
      is_active: nextStatus === "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", adminId)
    .eq("tenant_id", profile.tenant_id);

  if (updateError) {
    return { ok: false, error: updateError.message };
  }

  return { ok: true, data: { status: nextStatus } };
}

// ─────────────────────────────────────────
// updateUserProfile — admin only, target must belong to same tenant.
// Allowlists writable columns; anything else is dropped.
// ─────────────────────────────────────────
const USER_PROFILE_ALLOWED_COLUMNS = [
  "is_active",
  "fee_status",
  "fee",
  "airtable",
  "status",
] as const;
type UserProfileUpdatable = Partial<
  Record<(typeof USER_PROFILE_ALLOWED_COLUMNS)[number], unknown>
>;

export async function updateUserProfile(
  userId: string,
  data: UserProfileUpdatable,
): Promise<ActionResult> {
  if (typeof userId !== "string" || userId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid payload" };
  }

  const caller = await assertAdmin();
  if (!caller.ok) return { ok: false, error: caller.error };
  const { supabase, profile } = caller.ctx;

  // Allowlist columns
  const cleaned: Record<string, unknown> = {};
  for (const col of USER_PROFILE_ALLOWED_COLUMNS) {
    if (col in data) cleaned[col] = data[col];
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No updatable fields" };
  }

  // Verify target belongs to caller's tenant and is not another admin
  const { data: target, error: fetchError } = await supabase
    .from("user_profiles")
    .select("id, tenant_id, role")
    .eq("id", userId)
    .maybeSingle();
  if (fetchError || !target) {
    return { ok: false, error: "User not found" };
  }
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (target.role === "admin") {
    return { ok: false, error: "Use toggleAdminStatus for admins" };
  }

  const shouldDeactivateSubscriptions = cleaned.status === "inactive";
  if (shouldDeactivateSubscriptions) {
    const { data: advertisers, error: advertisersError } = await supabase
      .from("advertisers")
      .select("id")
      .eq("profile_id", userId);
    if (advertisersError) {
      return { ok: false, error: advertisersError.message };
    }
    const advertiserIds = (advertisers ?? []).map((a) => a.id);
    if (advertiserIds.length > 0) {
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({ status: "inactive" })
        .in("advertiser_id", advertiserIds)
        .neq("status", "inactive");
      if (subError) return { ok: false, error: subError.message };
    }
  }

  cleaned.updated_at = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("user_profiles")
    .update(cleaned)
    .eq("id", userId)
    .eq("tenant_id", profile.tenant_id);

  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// updateAdvertiser — admin only, target must belong to same tenant.
// Allowlists writable columns (includes commission fields).
// ─────────────────────────────────────────
const ADVERTISER_ALLOWED_COLUMNS = [
  "startup_fee",
  "fee_status",
  "airtable",
  "note",
  "commission_type",
  "commission_pct",
  "commission_onetime",
  "commission_monthly",
  "commission_currency",
] as const;
type AdvertiserUpdatable = Partial<
  Record<(typeof ADVERTISER_ALLOWED_COLUMNS)[number], unknown>
>;

export async function updateAdvertiser(
  advertiserId: string,
  payload: AdvertiserUpdatable,
): Promise<ActionResult> {
  if (typeof advertiserId !== "string" || advertiserId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid payload" };
  }

  const caller = await assertAdmin();
  if (!caller.ok) return { ok: false, error: caller.error };
  const { supabase, profile } = caller.ctx;

  const cleaned: Record<string, unknown> = {};
  for (const col of ADVERTISER_ALLOWED_COLUMNS) {
    if (col in payload) cleaned[col] = payload[col];
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No updatable fields" };
  }

  const { data: target, error: fetchError } = await supabase
    .from("advertisers")
    .select("id, tenant_id")
    .eq("id", advertiserId)
    .maybeSingle();
  if (fetchError || !target) {
    return { ok: false, error: "Advertiser not found" };
  }
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const { error: updateError } = await supabase
    .from("advertisers")
    .update(cleaned)
    .eq("id", advertiserId)
    .eq("tenant_id", profile.tenant_id);

  if (updateError) return { ok: false, error: updateError.message };

  return { ok: true, data: null };
}
