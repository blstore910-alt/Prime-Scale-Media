"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import {
  checkVersion,
  maintenanceGuard,
  versionMatches,
  type ActionResult,
  wroteSomething,
} from "./_shared";

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
    .select("id, role, tenant_id, user_id, is_active, status")
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

  // A deactivated profile keeps its role but loses all access — a
  // disabled admin must not be able to act.
  if (
    profile.is_active === false ||
    (profile.status ?? "active") === "inactive"
  ) {
    return { ok: false, error: "Account is inactive", status: 403 };
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
  ifUpdatedAt?: string,
): Promise<ActionResult<{ status: "active" | "inactive" }>> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
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
  if (!(await checkVersion(supabase, "user_profiles", adminId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This admin was changed by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const nextStatus = target.status === "active" ? "inactive" : "active";

  const { data: adminRows, error: updateError } = await supabase
    .from("user_profiles")
    .update({
      status: nextStatus,
      is_active: nextStatus === "active",
      updated_at: new Date().toISOString(),
    })
    .eq("id", adminId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");

  if (updateError) {
    return { ok: false, error: updateError.message };
  }
  // Deactivating an admin who stays active is the one failure this action
  // must never report as success — the same bug updateUserProfile had, and
  // here it leaves someone holding powers the owner thinks they removed.
  {
    const wrote = wroteSomething(adminRows);
    if (!wrote.ok) return wrote;
  }

  return { ok: true, data: { status: nextStatus } };
}

// ─────────────────────────────────────────
// updateUserProfile — admin only, target must belong to same tenant.
// Allowlists writable columns; anything else is dropped.
// ─────────────────────────────────────────
// NOTE: fee_status / fee / airtable are NOT columns on user_profiles —
// they live on `advertisers` and are edited via updateAdvertiser. Listing
// them here was a trap: the moment a caller passed one, the
// .from("user_profiles").update() would 400 with "column does not exist".
// Only genuine user_profiles columns belong in this allowlist.
const USER_PROFILE_ALLOWED_COLUMNS = [
  "is_active",
  "status",
  // Names are typed by customers at signup and arrive wrong often enough to
  // matter: a company name in the first-name box, a typo, a legal name that
  // has since changed. It appears on invoices, so leaving it uneditable
  // means the desk either lives with it or edits the database by hand. The
  // action is already admin-only, refuses admin targets, and every change is
  // recorded by the _audit_row_change trigger on user_profiles.
  "full_name",
] as const;
type UserProfileUpdatable = Partial<
  Record<(typeof USER_PROFILE_ALLOWED_COLUMNS)[number], unknown>
>;

export async function updateUserProfile(
  userId: string,
  data: UserProfileUpdatable,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof userId !== "string" || userId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  if (!data || typeof data !== "object") {
    return { ok: false, error: "Invalid payload", code: "invalid" };
  }

  const caller = await assertAdmin();
  if (!caller.ok) return { ok: false, error: caller.error, code: "forbidden" };
  const { supabase, profile } = caller.ctx;

  // Allowlist columns
  const cleaned: Record<string, unknown> = {};
  for (const col of USER_PROFILE_ALLOWED_COLUMNS) {
    if (col in data) cleaned[col] = data[col];
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No updatable fields", code: "invalid" };
  }

  // Verify target belongs to caller's tenant and is not another admin
  const { data: target, error: fetchError } = await supabase
    .from("user_profiles")
    .select("id, tenant_id, role, updated_at")
    .eq("id", userId)
    .maybeSingle();
  if (fetchError || !target) {
    return { ok: false, error: "User not found", code: "not_found" };
  }
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (target.role === "admin") {
    return {
      ok: false,
      error: "Use toggleAdminStatus for admins",
      code: "forbidden",
    };
  }
  if (!versionMatches(target.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This user was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const shouldDeactivateSubscriptions = cleaned.status === "inactive";
  // ── AND THE WAY BACK ────────────────────────────────────────────────
  //
  // Deactivating wrote every subscription to inactive. Activating wrote
  // only the profile. subscription_billing_run selects status in
  // ('active','past_due'), so a customer switched back on was never
  // invoiced again — they sign in, top up, spend, and are billed
  // nothing, for ever. Nothing on screen said so either: the confirm
  // step treats reactivation as harmless and skips itself.
  //
  // Only `inactive` goes back. `cancelled` is a decision somebody made
  // about the plan itself and is not ours to undo here, and `paused` is
  // a state the admin set deliberately on the subscriptions screen.
  // That distinction is already in the data; it just was not used.
  const shouldReactivateSubscriptions = cleaned.status === "active";

  if (shouldDeactivateSubscriptions || shouldReactivateSubscriptions) {
    const { data: advertisers, error: advertisersError } = await supabase
      .from("advertisers")
      .select("id")
      .eq("profile_id", userId);
    if (advertisersError) {
      return { ok: false, error: advertisersError.message };
    }
    const advertiserIds = (advertisers ?? []).map((a) => a.id);
    if (advertiserIds.length > 0 && shouldDeactivateSubscriptions) {
      // No row count here ON PURPOSE. This is a bulk "make sure none of
      // their subscriptions are still running", and an advertiser with no
      // active subscription legitimately matches nothing. A guard would turn
      // the ordinary case into an error.
      //
      // .not(col,"is",...) rather than .neq: PostgREST's neq DROPS NULL
      // rows, so a subscription whose status was never set stayed
      // running after its owner was switched off.
      const { error: subError } = await supabase
        .from("subscriptions")
        .update({ status: "inactive" })
        .in("advertiser_id", advertiserIds)
        .or("status.is.null,status.neq.inactive");
      if (subError) return { ok: false, error: subError.message };
    }
    if (advertiserIds.length > 0 && shouldReactivateSubscriptions) {
      const { data: dormant, error: dormantError } = await supabase
        .from("subscriptions")
        .select("id, next_payment_date")
        .in("advertiser_id", advertiserIds)
        .eq("status", "inactive");
      if (dormantError) return { ok: false, error: dormantError.message };

      // NOT BACK-BILLED FOR THE TIME THEY WERE SWITCHED OFF. If
      // next_payment_date is still months in the past, the nightly run
      // raises an invoice for that old period, the paid-trigger rolls it
      // forward one month, and the next night raises another — a queue of
      // invoices for months during which the customer could not use the
      // account. Billing resumes from today.
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      for (const row of dormant ?? []) {
        const prev = row.next_payment_date
          ? new Date(row.next_payment_date as string)
          : null;
        const next = prev && prev > today ? prev : today;
        const { error: onError } = await supabase
          .from("subscriptions")
          .update({
            status: "active",
            next_payment_date: next.toISOString(),
          })
          .eq("id", row.id);
        if (onError) return { ok: false, error: onError.message };
      }
    }
  }

  cleaned.updated_at = new Date().toISOString();

  // .select() and count the rows, because an UPDATE that matches NOTHING is
  // not an error in PostgREST: it returns no error and no rows, and this
  // action was reporting that as success. Deactivating a user therefore
  // showed "User has been deactivated successfully", refetched, and came
  // back active — so the button said "Deactivate" again, every time, and the
  // only clue was that nothing ever changed. RLS refusing the write looks
  // exactly like this.
  const { data: updated, error: updateError } = await supabase
    .from("user_profiles")
    .update(cleaned)
    .eq("id", userId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");

  if (updateError) return { ok: false, error: updateError.message };
  if (!updated || updated.length === 0) {
    return {
      ok: false,
      error:
        "That change was not saved — the row could not be written. Reload and try again.",
      code: "forbidden",
    };
  }

  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// Affiliate mutations — three separate actions, one per authority
// level and lifecycle stage:
//
//   updateAffiliate       admin  → note / airtable (annotation only)
//   approveAffiliate      admin  → status: pending → active
//   rejectAffiliate       admin  → status: pending → rejected
//   setAffiliateCommission super-admin → commission_pct/onetime/…
//
// Commission changes are gated to super-admin only because they
// directly affect what the platform pays out. Approval is admin-
// level ops so a support employee can onboard referrals without
// touching the payout economics.
// ─────────────────────────────────────────

// fee_commission is a boolean gate (payouts on/off) — a workflow
// decision that admin makes; the *rate* stays 0 unless super-admin
// sets it, so an admin flipping fee_commission=true without a rate
// still pays out nothing.
const AFFILIATE_ANNOTATION_COLUMNS = [
  "note",
  "airtable",
  "fee_commission",
] as const;
type AffiliateAnnotationInput = Partial<
  Record<(typeof AFFILIATE_ANNOTATION_COLUMNS)[number], unknown>
>;

export async function updateAffiliate(
  affiliateId: string,
  payload: AffiliateAnnotationInput,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof affiliateId !== "string" || affiliateId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  const caller = await assertAdmin();
  if (!caller.ok) return { ok: false, error: caller.error, code: "forbidden" };
  const { supabase, profile } = caller.ctx;

  const cleaned: Record<string, unknown> = {};
  for (const col of AFFILIATE_ANNOTATION_COLUMNS) {
    if (col in payload) cleaned[col] = payload[col];
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No updatable fields", code: "invalid" };
  }

  const { data: target } = await supabase
    .from("affiliates")
    .select("id, tenant_id, updated_at")
    .eq("id", affiliateId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Affiliate not found", code: "not_found" };
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(target.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This affiliate was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const { data: writtenRows, error } = await supabase
    .from("affiliates")
    .update(cleaned)
    .eq("id", affiliateId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // An UPDATE matching NO rows is not an error in PostgREST, so this
  // used to report a change that never happened and the screen then
  // re-rendered the old value.
  {
    const wrote = wroteSomething(writtenRows);
    if (!wrote.ok) return wrote;
  }
  return { ok: true, data: null };
}

export async function approveAffiliate(
  affiliateId: string,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  const caller = await assertAdmin();
  if (!caller.ok) return { ok: false, error: caller.error, code: "forbidden" };
  const { supabase, profile } = caller.ctx;

  const { data: target } = await supabase
    .from("affiliates")
    .select("id, tenant_id, updated_at, status")
    .eq("id", affiliateId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Affiliate not found", code: "not_found" };
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(target.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This affiliate was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const { data: writtenRows, error } = await supabase
    .from("affiliates")
    .update({ status: "active" })
    .eq("id", affiliateId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // An UPDATE matching NO rows is not an error in PostgREST, so this
  // used to report a change that never happened and the screen then
  // re-rendered the old value.
  {
    const wrote = wroteSomething(writtenRows);
    if (!wrote.ok) return wrote;
  }
  return { ok: true, data: null };
}

export async function rejectAffiliate(
  affiliateId: string,
  reason?: string,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  const caller = await assertAdmin();
  if (!caller.ok) return { ok: false, error: caller.error, code: "forbidden" };
  const { supabase, profile } = caller.ctx;

  const { data: target } = await supabase
    .from("affiliates")
    .select("id, tenant_id, updated_at, status")
    .eq("id", affiliateId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Affiliate not found", code: "not_found" };
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(target.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This affiliate was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const patch: Record<string, unknown> = { status: "rejected" };
  if (typeof reason === "string" && reason.trim().length > 0) {
    patch.note = reason.trim().slice(0, 500);
  }

  const { data: writtenRows, error } = await supabase
    .from("affiliates")
    .update(patch)
    .eq("id", affiliateId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // An UPDATE matching NO rows is not an error in PostgREST, so this
  // used to report a change that never happened and the screen then
  // re-rendered the old value.
  {
    const wrote = wroteSomething(writtenRows);
    if (!wrote.ok) return wrote;
  }
  return { ok: true, data: null };
}

const AFFILIATE_COMMISSION_COLUMNS = [
  "commission_type",
  "commission_pct",
  "commission_onetime",
  "commission_monthly",
  "commission_currency",
] as const;
type AffiliateCommissionInput = Partial<
  Record<(typeof AFFILIATE_COMMISSION_COLUMNS)[number], unknown>
>;

// Super-admin only: setting how much the platform pays out for a
// referral is a financial-authority decision, not a support-desk
// one. Employees can approve the relationship (approveAffiliate)
// but not the amount.
export async function setAffiliateCommission(
  affiliateId: string,
  payload: AffiliateCommissionInput,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;

  // Reuse the admin resolver, then enforce super-admin (tenant owner).
  const caller = await assertAdmin();
  if (!caller.ok) return { ok: false, error: caller.error, code: "forbidden" };
  const { supabase, profile } = caller.ctx;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  const isSuperAdmin =
    !!tenant?.owner_id && tenant.owner_id === profile.user_id;
  if (!isSuperAdmin) {
    return {
      ok: false,
      error: "Only the tenant owner can change commission rates.",
      code: "forbidden",
    };
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of AFFILIATE_COMMISSION_COLUMNS) {
    if (col in payload) cleaned[col] = payload[col];
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No commission fields provided", code: "invalid" };
  }
  // ── Bound the percentage ────────────────────────────────────────────
  // Nothing bounded this anywhere. The input has max="100" — an HTML
  // attribute, not a validation — the schema column is a bare numeric with
  // no CHECK, and the accrual trigger only guards <= 0:
  //     v_amount := round(new.amount * v_link.commission_pct / 100.0, 2)
  // So 1000 typed where 10.00 was meant turns a EUR 5,000 top-up into a
  // EUR 50,000 commission row, accrued silently and discovered at payout.
  // lib/commission.ts states the 0-100 convention and is imported by
  // nothing; this is where it has to hold.
  if ("commission_pct" in cleaned && cleaned.commission_pct !== null) {
    const pct = Number(cleaned.commission_pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return {
        ok: false,
        error: "A commission percentage is between 0 and 100.",
        code: "invalid",
      };
    }
  }


  const { data: target } = await supabase
    .from("affiliates")
    .select("id, tenant_id, updated_at")
    .eq("id", affiliateId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Affiliate not found", code: "not_found" };
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(target.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This affiliate was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const { data: writtenRows, error } = await supabase
    .from("affiliates")
    .update(cleaned)
    .eq("id", affiliateId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // An UPDATE matching NO rows is not an error in PostgREST, so this
  // used to report a change that never happened and the screen then
  // re-rendered the old value.
  {
    const wrote = wroteSomething(writtenRows);
    if (!wrote.ok) return wrote;
  }
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// updateAdvertiser — admin only. Non-commission columns.
// Commission fields moved to setAdvertiserCommission (super-admin
// only) — matches the affiliate split. Prevents a plain admin from
// setting an advertiser's cashback / referral commission from the
// /users page.
// ─────────────────────────────────────────
const ADVERTISER_ALLOWED_COLUMNS = [
  "startup_fee",
  "fee_status",
  "airtable",
  "note",
] as const;
type AdvertiserUpdatable = Partial<
  Record<(typeof ADVERTISER_ALLOWED_COLUMNS)[number], unknown>
>;

export async function updateAdvertiser(
  advertiserId: string,
  payload: AdvertiserUpdatable,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  if (typeof advertiserId !== "string" || advertiserId.length === 0) {
    return { ok: false, error: "Invalid input", code: "invalid" };
  }
  if (!payload || typeof payload !== "object") {
    return { ok: false, error: "Invalid payload", code: "invalid" };
  }

  const caller = await assertAdmin();
  if (!caller.ok) return { ok: false, error: caller.error, code: "forbidden" };
  const { supabase, profile } = caller.ctx;

  const cleaned: Record<string, unknown> = {};
  for (const col of ADVERTISER_ALLOWED_COLUMNS) {
    if (col in payload) cleaned[col] = payload[col];
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No updatable fields", code: "invalid" };
  }

  const { data: target, error: fetchError } = await supabase
    .from("advertisers")
    .select("id, tenant_id, updated_at")
    .eq("id", advertiserId)
    .maybeSingle();
  if (fetchError || !target) {
    return { ok: false, error: "Advertiser not found", code: "not_found" };
  }
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(target.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This advertiser was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const { data: advRows, error: updateError } = await supabase
    .from("advertisers")
    .update(cleaned)
    .eq("id", advertiserId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");

  if (updateError) return { ok: false, error: updateError.message };
  {
    const wrote = wroteSomething(advRows);
    if (!wrote.ok) return wrote;
  }

  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// setAdvertiserCommission — SUPER-ADMIN ONLY.
// Structural / financial authority to change what the platform
// pays this advertiser (typical use case: cashback %, referrer
// commission). An employee-tier admin never touches these — same
// rule the affiliate variant uses.
// ─────────────────────────────────────────
const ADVERTISER_COMMISSION_COLUMNS = [
  "commission_type",
  "commission_pct",
  "commission_onetime",
  "commission_monthly",
  "commission_currency",
] as const;
type AdvertiserCommissionInput = Partial<
  Record<(typeof ADVERTISER_COMMISSION_COLUMNS)[number], unknown>
>;

export async function setAdvertiserCommission(
  advertiserId: string,
  payload: AdvertiserCommissionInput,
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  const caller = await assertAdmin();
  if (!caller.ok) return { ok: false, error: caller.error, code: "forbidden" };
  const { supabase, profile } = caller.ctx;

  const { data: tenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  const isSuperAdmin =
    !!tenant?.owner_id && tenant.owner_id === profile.user_id;
  if (!isSuperAdmin) {
    return {
      ok: false,
      error: "Only the tenant owner can change commission rates.",
      code: "forbidden",
    };
  }

  const cleaned: Record<string, unknown> = {};
  for (const col of ADVERTISER_COMMISSION_COLUMNS) {
    if (col in payload) cleaned[col] = payload[col];
  }
  if (Object.keys(cleaned).length === 0) {
    return { ok: false, error: "No commission fields provided", code: "invalid" };
  }

  // ── Bound the percentage ────────────────────────────────────────────
  // Nothing bounded this anywhere. The input has max="100" — an HTML
  // attribute, not a validation — the schema column is a bare numeric with
  // no CHECK, and the accrual trigger only guards <= 0:
  //     v_amount := round(new.amount * v_link.commission_pct / 100.0, 2)
  // So 1000 typed where 10.00 was meant turns a EUR 5,000 top-up into a
  // EUR 50,000 commission row, accrued silently and discovered at payout.
  // lib/commission.ts states the 0-100 convention and is imported by
  // nothing; this is where it has to hold.
  //
  // This check sat INSIDE the block above, after its return — so it was
  // unreachable, and the affiliate twin forty lines up had it right. A
  // guard in the wrong scope is worse than no guard: it reads as done.
  if ("commission_pct" in cleaned && cleaned.commission_pct !== null) {
    const pct = Number(cleaned.commission_pct);
    if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
      return {
        ok: false,
        error: "A commission percentage is between 0 and 100.",
        code: "invalid",
      };
    }
  }

  const { data: target } = await supabase
    .from("advertisers")
    .select("id, tenant_id, updated_at")
    .eq("id", advertiserId)
    .maybeSingle();
  if (!target) return { ok: false, error: "Advertiser not found", code: "not_found" };
  if (target.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden", code: "forbidden" };
  }
  if (!versionMatches(target.updated_at, ifUpdatedAt)) {
    return {
      ok: false,
      error: "This advertiser was updated by someone else. Reload and retry.",
      code: "conflict",
    };
  }

  const { data: writtenRows, error } = await supabase
    .from("advertisers")
    .update(cleaned)
    .eq("id", advertiserId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  // An UPDATE matching NO rows is not an error in PostgREST, so this
  // used to report a change that never happened and the screen then
  // re-rendered the old value.
  {
    const wrote = wroteSomething(writtenRows);
    if (!wrote.ok) return wrote;
  }
  return { ok: true, data: null };
}
