"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { checkVersion, maintenanceGuard, wroteSomething } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdminCtx() {
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false as const, error: mm.error };
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id, is_active, status")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  // Deactivated admin keeps role but loses access.
  if (profile.is_active === false || (profile.status ?? "active") === "inactive") {
    return { ok: false as const, error: "Account is inactive" };
  }
  return { ok: true as const, supabase, profile };
}

// ─────────────────────────────────────────
// referral_commissions: admin toggle paid/unpaid
// ─────────────────────────────────────────
export async function setCommissionStatus(
  commissionId: string,
  status: "paid" | "unpaid",
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (typeof commissionId !== "string" || commissionId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  if (status !== "paid" && status !== "unpaid") {
    return { ok: false, error: "Invalid status" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // Marking commissions paid is an owner-level action (payouts are
  // owner-controlled, and /commissions is a super-admin page) — a plain
  // admin must not flip commission status by invoking this directly.
  const { data: commTenant } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();
  if (!commTenant || commTenant.owner_id !== profile.user_id) {
    return {
      ok: false,
      error: "Only the tenant owner can change commission status.",
    };
  }

  const { data: commission, error: readErr } = await supabase
    .from("referral_commissions")
    .select("id, tenant_id, status")
    .eq("id", commissionId)
    .maybeSingle();
  // A read we could not make is not permission. This discarded `error`,
  // and the same shape has now been found four times in this codebase.
  if (readErr) {
    return {
      ok: false,
      error: "Could not read this commission, so its status was not changed.",
    };
  }
  if (!commission) return { ok: false, error: "Commission not found" };
  if (commission.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  // ── PAID DOES NOT GO BACK TO UNPAID ─────────────────────────────────
  //
  // The control is a toggle whose label flips with the status, so one
  // click returns a settled commission to the unpaid worklist — and
  // referral_commissions has no paid_at and no payout reference, so
  // nothing anywhere records that the money already left. The next payout
  // run pays it again.
  //
  // It is worse than the invoice case it mirrors: the accrual reversal
  // deletes rows `where status = 'unpaid'`, so a reopened row can then be
  // deleted outright, erasing the record of a payment that was made.
  //
  // invoice-actions.ts refuses exactly this transition and says why. This
  // is the same refusal, for the same reason.
  if ((commission.status ?? "") === "paid" && status === "unpaid") {
    return {
      ok: false,
      error:
        "A paid commission can't be set back to unpaid — nothing records that the payout already happened, so the next run would pay it twice. Raise a clawback or a correction instead.",
    };
  }

  // Already paid, asked to be paid: do nothing rather than rewrite the
  // row and bump updated_at, which is what optimistic concurrency reads.
  if ((commission.status ?? "") === status) {
    return { ok: true, data: null };
  }
  if (!(await checkVersion(supabase, "referral_commissions", commissionId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This commission was changed by someone else. Reload and retry.",
    };
  }

  // Count the rows. Marking a commission paid when nothing was written means
  // an affiliate is recorded as settled and is not, which surfaces as a
  // dispute rather than as an error.
  const { data: rows, error } = await supabase
    .from("referral_commissions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", commissionId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const wrote = wroteSomething(rows);
  if (!wrote.ok) return wrote;
  return { ok: true, data: null };
}

// ─────────────────────────────────────────
// referral_links: admin assigns an affiliate to a referred advertiser
// ─────────────────────────────────────────
type AssignAffiliateInput = {
  referred_advertiser_id: string;
  affiliate_advertiser_id: string;
};

export async function assignAffiliateToAdvertiser(
  input: AssignAffiliateInput,
): Promise<ActionResult<{ id: string }>> {
  if (
    !input?.referred_advertiser_id ||
    !input?.affiliate_advertiser_id ||
    input.referred_advertiser_id === input.affiliate_advertiser_id
  ) {
    return { ok: false, error: "Invalid input" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  // ── OWNER ONLY. THIS SETS WHAT WE PAY. ──────────────────────────────
  //
  // "Set referrer" does not merely link two accounts: it copies
  // commission_type, pct, onetime and monthly onto the referral link and
  // marks it active. affiliate_commission_rate is SUPER_ADMIN_ONLY in
  // lib/permissions.ts, and setAdvertiserCommission and
  // setAffiliateCommission are both owner-gated for exactly that reason.
  // This was four clicks on a requireAdmin page that went round both of
  // them, and round the owner-only approve step on /affiliates as well.
  {
    const { data: ownerRow } = await supabase
      .from("tenants")
      .select("owner_id")
      .eq("id", profile.tenant_id)
      .maybeSingle();
    if (
      !ownerRow ||
      (ownerRow as { owner_id: string | null }).owner_id !== profile.user_id
    ) {
      return {
        ok: false,
        error:
          "Only the account owner can set a referrer, because it sets the commission we pay. Ask them to make this change.",
      };
    }
  }

  // Both advertisers must be in caller's tenant.
  const { data: rows, error: fetchError } = await supabase
    .from("advertisers")
    .select(
      "id, tenant_id, user_id, commission_type, commission_pct, commission_onetime, commission_monthly, commission_currency",
    )
    .in("id", [input.referred_advertiser_id, input.affiliate_advertiser_id]);
  if (fetchError) return { ok: false, error: fetchError.message };
  if (!rows || rows.length !== 2) {
    return { ok: false, error: "Advertisers not found" };
  }
  const referred = rows.find((r) => r.id === input.referred_advertiser_id);
  const affiliate = rows.find((r) => r.id === input.affiliate_advertiser_id);
  if (!referred || !affiliate) return { ok: false, error: "Advertisers not found" };
  if (
    referred.tenant_id !== profile.tenant_id ||
    affiliate.tenant_id !== profile.tenant_id
  ) {
    return { ok: false, error: "Forbidden" };
  }

  // Prevent duplicate links per referred advertiser.
  const { data: existing } = await supabase
    .from("referral_links")
    .select("id")
    .eq("referred_advertiser_id", referred.id)
    .limit(1)
    .maybeSingle();
  if (existing?.id) {
    return { ok: false, error: "Advertiser already has an affiliate" };
  }

  const { data: inserted, error: insertError } = await supabase
    .from("referral_links")
    .insert({
      tenant_id: profile.tenant_id,
      referred_advertiser_id: referred.id,
      affiliate_advertiser_id: affiliate.id,
      advertiser_user_id: referred.user_id,
      affiliate_user_id: affiliate.user_id,
      commission_type: affiliate.commission_type,
      commission_pct: affiliate.commission_pct,
      commission_onetime: affiliate.commission_onetime,
      commission_monthly: affiliate.commission_monthly,
      commission_currency: affiliate.commission_currency,
      // An admin manually creating the link IS the approval, so it
      // goes straight to active (self-signup links start pending).
      status: "active",
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true, data: { id: inserted.id } };
}

// ─────────────────────────────────────────
// referral_links: admin approves / rejects a pending referral.
// Only an approved (active) link accrues commission — see the
// _accrue_referral_commission trigger.
// ─────────────────────────────────────────
export async function setReferralLinkStatus(
  referralLinkId: string,
  status: "active" | "rejected",
  ifUpdatedAt?: string,
): Promise<ActionResult> {
  if (typeof referralLinkId !== "string" || referralLinkId.length === 0) {
    return { ok: false, error: "Invalid input" };
  }
  if (status !== "active" && status !== "rejected") {
    return { ok: false, error: "Invalid status" };
  }

  const ctx = await requireAdminCtx();
  if (!ctx.ok) return { ok: false, error: ctx.error };
  const { supabase, profile } = ctx;

  const { data: link } = await supabase
    .from("referral_links")
    .select("id, tenant_id")
    .eq("id", referralLinkId)
    .maybeSingle();
  if (!link) return { ok: false, error: "Referral not found" };
  if (link.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  if (!(await checkVersion(supabase, "referral_links", referralLinkId, ifUpdatedAt))) {
    return {
      ok: false,
      error: "This referral link was changed by someone else. Reload and retry.",
    };
  }

  // Count the rows. This is the switch that makes someone an affiliate at
  // all — the advertiser app reads exactly this status — so a silent no-op
  // here is an approval that was never granted and nobody knows it.
  const { data: linkRows, error } = await supabase
    .from("referral_links")
    .update({ status })
    .eq("id", referralLinkId)
    .eq("tenant_id", profile.tenant_id)
    .select("id");
  if (error) return { ok: false, error: error.message };
  const wroteLink = wroteSomething(linkRows);
  if (!wroteLink.ok) return wroteLink;
  return { ok: true, data: null };
}
