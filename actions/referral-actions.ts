"use server";

import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

async function requireAdminCtx() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false as const, error: "Unauthorized" };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
    .eq("user_id", userData.user.id);
  if (!profiles?.length) return { ok: false as const, error: "Forbidden" };

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (profile.role !== "admin" || !profile.tenant_id) {
    return { ok: false as const, error: "Forbidden" };
  }
  return { ok: true as const, supabase, profile };
}

// ─────────────────────────────────────────
// referral_commissions: admin toggle paid/unpaid
// ─────────────────────────────────────────
export async function setCommissionStatus(
  commissionId: string,
  status: "paid" | "unpaid",
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

  const { data: commission } = await supabase
    .from("referral_commissions")
    .select("id, tenant_id")
    .eq("id", commissionId)
    .maybeSingle();
  if (!commission) return { ok: false, error: "Commission not found" };
  if (commission.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }

  const { error } = await supabase
    .from("referral_commissions")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", commissionId)
    .eq("tenant_id", profile.tenant_id);
  if (error) return { ok: false, error: error.message };
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
    })
    .select("id")
    .single();
  if (insertError) return { ok: false, error: insertError.message };
  return { ok: true, data: { id: inserted.id } };
}
