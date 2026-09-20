"use server";

import { adminOnlyNotificationTypes } from "@/lib/notification-catalog";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { maintenanceGuard, wroteSomething } from "./_shared";

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
    ad_account_requests: unknown[];
    ad_accounts: unknown[];
    notifications: unknown[];
    invitations: unknown[];
    /** What is deliberately left out, and why. */
    _not_included: string[];
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
    // ── NOT `*`, FOR THE SAME REASON AS EVERY OTHER TABLE HERE ─────
    //
    // The policy is written out sixty lines below -- "`*` on an export
    // is a standing promise to hand the customer every column anybody
    // adds later" -- and every table obeyed it except this one, which
    // is the table holding role, status and the referral fields. On a
    // hand-authored schema nobody could say from this repo what a
    // customer actually receives, and any admin-only column added to
    // user_profiles shipped to them on the next download.
    //
    // Their identity, their settings, their dates. Not our workflow.
    supabase
      .from("user_profiles")
      .select(
        "id, user_id, tenant_id, full_name, email, phone, avatar_url, country, timezone, language, created_at, updated_at",
      )
      .eq("user_id", userId),
    // NOT advertisers(*). That row carries the commission terms we owe an
    // affiliate for having referred this customer — commission_type,
    // commission_pct, commission_onetime, commission_monthly,
    // commission_currency — which is our arrangement with a third party.
    // lib/types/advertiser-columns.ts says exactly this, and the session
    // read was fixed for it; the GDPR export was not. It is the ONE
    // surface where "we never render it" is no cover at all: the whole row
    // IS the deliverable, downloaded as JSON by the customer themselves.
    supabase
      .from("advertisers")
      .select(
        "id, user_id, tenant_id, profile_id, tenant_client_code, startup_fee, fee_status, airtable, created_at, updated_at",
      )
      .eq("user_id", userId),
  ]);
  if (profiles.error) return { ok: false, error: profiles.error.message };
  if (advertisers.error) return { ok: false, error: advertisers.error.message };

  const advertiserIds = (advertisers.data ?? []).map((a) => a.id as string);
  const profileIds = (profiles.data ?? []).map((p) => p.id as string);

  // Per-table column lists, because `*` on an export is a standing promise
  // to hand the customer every column anybody adds later. A table that is
  // not in this map is not exported.
  //
  // What is deliberately NOT here:
  //   * referral_commissions — the amount we pay somebody ELSE for having
  //     referred this customer. It is not their personal data, it is our
  //     cost, and it was in the download.
  //   * top_ups.source / notes / author — internal fields; source can carry
  //     a supplier identifier.
  //   * ad_accounts.notes — admin free text about the customer's account.
  const EXPORT_COLUMNS: Record<string, string> = {
    wallets: "id, advertiser_id, currency, usd_balance, eur_balance, reference_no, min_topup, created_at, updated_at",
    wallet_topups:
      "id, advertiser_id, wallet_id, currency, amount, status, reference_no, payment_slip, created_at, updated_at",
    top_ups:
      "id, number, advertiser_id, account_id, currency, topup_currency, amount_received, topup_amount, amount_usd, fee, fee_amount, eur_value, eur_topup, rate, status, type, payment_slip, verified_at, created_at",
    invoices:
      "id, number, advertiser_id, company_id, subscription_id, type, currency, total, items, status, period_start, due_date, paid_at, created_at",
    companies:
      "id, advertiser_id, name, official_email, phone, website_url, vat_no, registration_no, address, country, state, zipcode, is_not_vat, created_at, updated_at",
    billings: "id, company_id, created_at, updated_at",
    subscriptions:
      "id, advertiser_id, currency, amount, status, start_date, next_payment_date, created_at, updated_at",
    //   * referral_links.affiliate_user_id — ANOTHER DATA SUBJECT'S
    //     auth.users id. This file's own header promises it "never
    //     exposes another user's data", and it was handing out the
    //     affiliate's primary key. Which affiliate referred them is
    //     arguably theirs to know; that person's database identifier is
    //     not, and it is the key to every other table they appear in.
    referral_links:
      "id, code, advertiser_user_id, status, created_at, updated_at",
    ad_account_requests:
      "id, advertiser_id, platform, currency, timezone, website_url, notes, status, created_at, updated_at",
    ad_accounts:
      "id, advertiser_id, name, bm_id, platform, currency, fee, status, timezone, website_url, min_topup, start_date, created_at, updated_at",
    notifications:
      "id, recipient_user_id, type, payload, is_read, created_at",
    invitations:
      "id, email, role, status, created_at, expires_at",
  };

  async function ownedBy(table: string, column: string, ids: string[]) {
    if (ids.length === 0) return [];
    const cols = EXPORT_COLUMNS[table];
    if (!cols) throw new Error(`${table}: no export column list`);
    // ── NOT AN ADMIN NOTIFICATION, WHOEVER IT WAS ADDRESSED TO ──────
    //
    // notifications.payload is exported verbatim, and the supplier
    // alerts carry the supplier's name and their account ids in
    // `summary`. Rendering is filtered on both customer shells now;
    // this file reads by recipient_user_id alone, so a mis-addressed
    // row still followed the customer into their download -- where it
    // is permanent, and where it is not about them anyway.
    const adminTypes = adminOnlyNotificationTypes();
    let q = supabase.from(table).select(cols).in(column, ids);
    if (table === "notifications" && adminTypes.length > 0) {
      // The null arm matters: .not(...in...) drops NULLs in PostgREST,
      // and a row with no type is not an admin alert.
      // PostgREST negates as `column.not.operator.value`, so it is
          // `type.not.in.(…)` -- `not.type.in.(…)` is a 400. That 400
          // is what put a grey DOT on the bell with no notification
          // behind it: the count query failed, countError went true,
          // and the badge correctly said "we could not ask" -- about a
          // question this code was asking wrongly.
          q = q.or(`type.is.null,type.not.in.(${adminTypes.join(",")})`);
    }
    const { data, error } = await q;
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
    // referral_commissions is NOT exported at all. It records what we pay
    // a third party for having referred this customer: our cost, not their
    // personal data. GDPR gives them their data, not our margins.
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
        .select(EXPORT_COLUMNS.invitations)
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
      // No referral_commissions key at all, rather than an empty array: an
      // empty array is a statement about THEIR data ("you have none") and
      // that statement would be false — the commissions exist, they are
      // just not theirs. The note below says so plainly instead.
      ad_account_requests: adAccountRequests,
      ad_accounts: adAccounts,
      notifications,
      invitations,
      // Accurate, and now complete: it did not mention the third party's
      // own identifier, which was in the file.
      _not_included: [
        "Commission we pay a third party for having referred you — that is our arrangement with them, not your personal data.",
        "Internal notes and references on your ad accounts and payments.",
        "The account identifier of anyone who referred you — that is their data, not yours.",
        "Internal fields on your profile that describe how we work an account rather than who you are.",
      ],
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

  // ── THE OWNER CANNOT ERASE THE OWNER ────────────────────────────
  //
  // This had no role check and writes status = pending_erasure,
  // is_active = false on EVERY profile row the caller holds. /profile is
  // reachable by admins, so the tenant owner sees "Request deletion" —
  // and pressing it locks them out permanently: requireSuperAdmin then
  // sends them to /inactive, every server action refuses them,
  // hardDeleteUser is super-admin-only so they cannot undo it, and
  // toggleAdminStatus refuses a self-target AND needs a super-admin
  // caller, so no employee admin can restore them either. The tenant is
  // left with no owner and no path back short of hand-written SQL.
  //
  // GDPR does not require a controller to be able to erase itself out of
  // its own tenancy. Refused, with the thing to do instead.
  const { data: ownedTenant } = await supabase
    .from("tenants")
    .select("id")
    .eq("owner_id", userData.user.id)
    .limit(1)
    .maybeSingle();
  if (ownedTenant?.id) {
    return {
      ok: false,
      error:
        "This account owns the organisation, so it cannot delete itself — everyone would lose access. Transfer ownership first, or contact us and we will do it for you.",
    };
  }

  // Count the rows. This is a legal request: telling someone their erasure
  // was registered when nothing was written leaves them believing a right
  // was exercised that was not, and the clock they think is running is not.
  // A profile can have several rows across tenants, so "at least one" is the
  // test rather than exactly one.
  const { data: rows, error } = await supabase
    .from("user_profiles")
    .update({
      status: "pending_erasure",
      is_active: false,
      updated_at: new Date().toISOString(),
    })
    .eq("user_id", userData.user.id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const wrote = wroteSomething(rows);
  if (!wrote.ok) return wrote;
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
    .select("id, role, tenant_id, user_id, is_active, status")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false, error: "Forbidden" };
  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];
  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  // Deactivated admin keeps role but loses access.
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false, error: "Account is inactive" };
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
