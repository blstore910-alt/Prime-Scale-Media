"use server";

import { createAdminClient, createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maintenanceGuard } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

/**
 * exportOwnData — GDPR "right to data portability".
 *
 * The caller downloads every row THEY are the data subject of, in a
 * structured JSON envelope. Never exposes another user's data.
 *
 * Called from /api/me/export which streams the payload as a JSON
 * attachment. This action is the pure data collector — it returns
 * the object, not a Response.
 */
export async function exportOwnData(): Promise<
  ActionResult<{
    exported_at: string;
    user: { id: string; email: string | null };
    profiles: unknown[];
    advertisers: unknown[];
    wallets: unknown[];
    wallet_topups: unknown[];
    top_ups: unknown[];
    invoices: unknown[];
    companies: unknown[];
    billings: unknown[];
    subscriptions: unknown[];
    referral_links: unknown[];
    referral_commissions: unknown[];
    ad_account_requests: unknown[];
    ad_accounts: unknown[];
    notifications: unknown[];
    invitations: unknown[];
  }>
> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Unauthorized" };
  }
  const userId = userData.user.id;

  // Everything below is a filtered read of the caller's OWN data.
  // Where the caller isn't the direct owner we join through
  // advertisers/profiles they own.
  const [
    profiles,
    advertisers,
  ] = await Promise.all([
    supabase.from("user_profiles").select("*").eq("user_id", userId),
    supabase.from("advertisers").select("*").eq("user_id", userId),
  ]);
  if (profiles.error) return { ok: false, error: profiles.error.message };
  if (advertisers.error) return { ok: false, error: advertisers.error.message };

  const advertiserIds = (advertisers.data ?? []).map((a) => a.id as string);
  const profileIds = (profiles.data ?? []).map((p) => p.id as string);

  async function ownedBy(table: string, column: string, ids: string[]) {
    if (ids.length === 0) return [];
    const { data, error } = await supabase.from(table).select("*").in(column, ids);
    if (error) throw new Error(`${table}: ${error.message}`);
    return data ?? [];
  }

  let wallets: unknown[] = [];
  let walletTopups: unknown[] = [];
  let topUps: unknown[] = [];
  let invoices: unknown[] = [];
  let companies: unknown[] = [];
  let billings: unknown[] = [];
  let subscriptions: unknown[] = [];
  let referralLinks: unknown[] = [];
  let referralCommissions: unknown[] = [];
  let adAccountRequests: unknown[] = [];
  let adAccounts: unknown[] = [];
  let notifications: unknown[] = [];
  let invitations: unknown[] = [];

  try {
    wallets = await ownedBy("wallets", "advertiser_id", advertiserIds);
    walletTopups = await ownedBy(
      "wallet_topups",
      "advertiser_id",
      advertiserIds,
    );
    topUps = await ownedBy("top_ups", "advertiser_id", advertiserIds);
    invoices = await ownedBy("invoices", "advertiser_id", advertiserIds);
    companies = await ownedBy("companies", "advertiser_id", advertiserIds);
    const companyIds = (companies as { id?: string }[])
      .map((c) => c.id)
      .filter((v): v is string => typeof v === "string");
    billings = await ownedBy("billings", "company_id", companyIds);
    subscriptions = await ownedBy(
      "subscriptions",
      "advertiser_id",
      advertiserIds,
    );
    referralLinks = (
      await Promise.all([
        ownedBy("referral_links", "advertiser_user_id", [userId]),
        ownedBy("referral_links", "affiliate_user_id", [userId]),
      ])
    ).flat();
    referralCommissions = await ownedBy(
      "referral_commissions",
      "advertiser_id",
      advertiserIds,
    );
    adAccountRequests = await ownedBy(
      "ad_account_requests",
      "advertiser_id",
      advertiserIds,
    );
    adAccounts = await ownedBy(
      "ad_accounts",
      "advertiser_id",
      advertiserIds,
    );
    notifications = await ownedBy(
      "notifications",
      "recipient_user_id",
      [userId],
    );
    // Invitations sent TO the caller's email
    if (userData.user.email) {
      const { data } = await supabase
        .from("invitations")
        .select("*")
        .eq("email", userData.user.email.toLowerCase());
      invitations = data ?? [];
    }
    // Deduplicate referral_links (a user can be on both sides)
    const seen = new Set<string>();
    referralLinks = referralLinks.filter((r) => {
      const id = (r as { id?: string }).id;
      if (!id || seen.has(id)) return false;
      seen.add(id);
      return true;
    });
  } catch (err) {
    return {
      ok: false,
      error: err instanceof Error ? err.message : "Export failed",
    };
  }
  void profileIds;

  return {
    ok: true,
    data: {
      exported_at: new Date().toISOString(),
      user: { id: userId, email: userData.user.email ?? null },
      profiles: profiles.data ?? [],
      advertisers: advertisers.data ?? [],
      wallets,
      wallet_topups: walletTopups,
      top_ups: topUps,
      invoices,
      companies,
      billings,
      subscriptions,
      referral_links: referralLinks,
      referral_commissions: referralCommissions,
      ad_account_requests: adAccountRequests,
      ad_accounts: adAccounts,
      notifications,
      invitations,
    },
  };
}

/**
 * requestOwnErasure — GDPR "right to be forgotten".
 *
 * Marks the caller's profile as `pending_erasure`. Does NOT actually
 * delete anything: erasure is a two-step process to protect against
 * accidental button-clicks AND to give the super-admin the required
 * 30-day window to satisfy retention obligations (tax law overrides
 * GDPR in many cases). See docs/PRIVACY_AND_DATA_LIFECYCLE.md for the
 * playbook the super-admin runs on the anniversary.
 */
export async function requestOwnErasure(): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;

  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Unauthorized" };
  }

  const { error } = await supabase
    .from("user_profiles")
    .update({
      status: "pending_erasure",
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userData.user.id);
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

/**
 * signOutAllDevices — user forces their own sessions closed on
 * every device.
 *
 * Supabase exposes signOut with `scope: "global"` which invalidates
 * every refresh token for the caller. Combined with our idle-timeout
 * this covers the "I lost my laptop" case: from any device the user
 * can sign in, hit the button, and everything else stops.
 */
export async function signOutAllDevices(): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Unauthorized" };

  const { error } = await supabase.auth.signOut({ scope: "global" });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: null };
}

/**
 * hardDeleteUser — super-admin only, executes the actual erasure.
 *
 * Uses the service-role client because deleting an auth.users row
 * requires admin privileges. Everything under the user cascades via
 * FK on-delete-cascade in the schema — verify your migration matches.
 *
 * BEFORE calling this, the super-admin must:
 *   1. Export the user's data (right-to-portability, above).
 *   2. Confirm retention obligations are cleared (see privacy doc).
 *   3. Take an audit-events snapshot; deletes cascade to that too if
 *      you don't have ON DELETE SET NULL on actor_user_id.
 */
export async function hardDeleteUser(
  targetUserId: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof targetUserId !== "string" || targetUserId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Unauthorized" };

  // Super-admin check: caller must be an admin whose tenant they own.
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false, error: "Forbidden" };
  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!tenant || tenant.owner_id !== profile.user_id) {
    return { ok: false, error: "Forbidden (super-admin only)" };
  }

  // Target must belong to the caller's tenant.
  const { data: target } = await supabase
    .from("user_profiles")
    .select("id, tenant_id, status")
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (!target) return { ok: false, error: "User not found" };
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden (cross-tenant)" };
  }
  if (target.status !== "pending_erasure") {
    return {
      ok: false,
      error: "User must first request erasure (status=pending_erasure).",
    };
  }

  // Actual delete via the auth admin API.
  const admin = await createAdminClient();
  const { error: delError } = await admin.auth.admin.deleteUser(targetUserId);
  if (delError) return { ok: false, error: delError.message };
  return { ok: true, data: null };
}
