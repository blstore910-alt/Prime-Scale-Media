"use server";

import { createClient } from "@/lib/supabase/server";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const COMPANY_ALLOWED = [
  "name",
  "official_email",
  "phone",
  "website_url",
  "vat_no",
  "address",
  "country",
  "state",
  "zipcode",
  "is_not_vat",
] as const;
type CompanyInput = Partial<Record<(typeof COMPANY_ALLOWED)[number], unknown>>;

const BILLING_ALLOWED = ["address", "state", "country", "zipcode"] as const;
type BillingInput = Partial<Record<(typeof BILLING_ALLOWED)[number], unknown>>;

async function resolveOwnedAdvertiser(): Promise<
  | {
      ok: true;
      supabase: Awaited<ReturnType<typeof createClient>>;
      profile: { id: string; tenant_id: string; user_id: string };
      advertiser: { id: string };
    }
  | { ok: false; error: string }
> {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Unauthorized" };
  }
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id, user_id, tenant_id")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!profile?.tenant_id) return { ok: false, error: "Profile missing" };

  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("id, tenant_id, user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (!advertiser) return { ok: false, error: "Advertiser missing" };
  if (advertiser.tenant_id !== profile.tenant_id) {
    return { ok: false, error: "Forbidden" };
  }
  return {
    ok: true,
    supabase,
    profile: {
      id: profile.id,
      user_id: profile.user_id,
      tenant_id: profile.tenant_id,
    },
    advertiser: { id: advertiser.id },
  };
}

// ─────────────────────────────────────────
// saveOwnCompanyOnboarding
// Advertiser creates or updates their OWN company + billing atomically.
// Server derives advertiser_id, tenant_id, user_profile_id from caller.
// ─────────────────────────────────────────
export async function saveOwnCompanyOnboarding(input: {
  company: CompanyInput;
  billing: BillingInput;
}): Promise<ActionResult<{ company_id: string }>> {
  if (!input?.company || !input?.billing) {
    return { ok: false, error: "Invalid input" };
  }
  const ctx = await resolveOwnedAdvertiser();
  if (!ctx.ok) return ctx;
  const { supabase, profile, advertiser } = ctx;

  const companyClean: Record<string, unknown> = {};
  for (const col of COMPANY_ALLOWED) {
    if (col in input.company) companyClean[col] = input.company[col];
  }
  companyClean.advertiser_id = advertiser.id;
  companyClean.tenant_id = profile.tenant_id;
  companyClean.user_profile_id = profile.id;

  const billingClean: Record<string, unknown> = {};
  for (const col of BILLING_ALLOWED) {
    if (col in input.billing) billingClean[col] = input.billing[col];
  }

  const { data: existing } = await supabase
    .from("companies")
    .select("id")
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  let companyId: string;
  if (existing?.id) {
    const { error: updateError } = await supabase
      .from("companies")
      .update(companyClean)
      .eq("id", existing.id)
      .eq("advertiser_id", advertiser.id);
    if (updateError) return { ok: false, error: updateError.message };
    companyId = existing.id;
  } else {
    const { data: inserted, error: insertError } = await supabase
      .from("companies")
      .insert(companyClean)
      .select("id")
      .single();
    if (insertError) return { ok: false, error: insertError.message };
    companyId = inserted.id;
  }

  billingClean.company_id = companyId;
  const { data: existingBilling } = await supabase
    .from("billings")
    .select("id")
    .eq("company_id", companyId)
    .maybeSingle();
  if (existingBilling?.id) {
    const { error: bError } = await supabase
      .from("billings")
      .update(billingClean)
      .eq("id", existingBilling.id);
    if (bError) return { ok: false, error: bError.message };
  } else {
    const { error: bError } = await supabase.from("billings").insert(billingClean);
    if (bError) return { ok: false, error: bError.message };
  }

  return { ok: true, data: { company_id: companyId } };
}

// ─────────────────────────────────────────
// updateOwnProfileAndCompany
// Used by /settings profile screen. Column allowlist for profile
// updates + company update. Server enforces owner of the profile.
// ─────────────────────────────────────────
const PROFILE_SELF_ALLOWED = [
  "full_name",
  "email",
  "phone",
  "airtable",
  "heard_from",
] as const;
type ProfileSelfInput = Partial<
  Record<(typeof PROFILE_SELF_ALLOWED)[number], unknown>
>;

export async function updateOwnProfileAndCompany(input: {
  profile?: ProfileSelfInput;
  company?: CompanyInput;
}): Promise<ActionResult> {
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Unauthorized" };

  const { data: profileRow } = await supabase
    .from("user_profiles")
    .select("id, tenant_id, user_id")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (!profileRow) return { ok: false, error: "Profile missing" };

  if (input.profile && Object.keys(input.profile).length > 0) {
    const cleaned: Record<string, unknown> = {};
    for (const col of PROFILE_SELF_ALLOWED) {
      if (col in input.profile) cleaned[col] = input.profile[col];
    }
    if (Object.keys(cleaned).length > 0) {
      const { error } = await supabase
        .from("user_profiles")
        .update(cleaned)
        .eq("id", profileRow.id)
        .eq("user_id", userData.user.id);
      if (error) return { ok: false, error: error.message };
    }
  }

  if (input.company && Object.keys(input.company).length > 0) {
    const { data: adv } = await supabase
      .from("advertisers")
      .select("id, tenant_id")
      .eq("user_id", userData.user.id)
      .maybeSingle();
    if (!adv) return { ok: false, error: "Advertiser missing" };
    if (adv.tenant_id !== profileRow.tenant_id) {
      return { ok: false, error: "Forbidden" };
    }

    const cleaned: Record<string, unknown> = {};
    for (const col of COMPANY_ALLOWED) {
      if (col in input.company) cleaned[col] = input.company[col];
    }
    cleaned.advertiser_id = adv.id;
    cleaned.tenant_id = profileRow.tenant_id;
    cleaned.user_profile_id = profileRow.id;

    const { data: existing } = await supabase
      .from("companies")
      .select("id")
      .eq("advertiser_id", adv.id)
      .maybeSingle();
    if (existing?.id) {
      const { error } = await supabase
        .from("companies")
        .update(cleaned)
        .eq("id", existing.id)
        .eq("advertiser_id", adv.id);
      if (error) return { ok: false, error: error.message };
    } else {
      const { error } = await supabase.from("companies").insert(cleaned);
      if (error) return { ok: false, error: error.message };
    }
  }

  return { ok: true, data: null };
}
