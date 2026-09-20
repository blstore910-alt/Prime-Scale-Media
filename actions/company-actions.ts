"use server";

import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { maintenanceGuard, wroteSomething } from "./_shared";

type ActionResult<T = null> =
  | { ok: true; data: T }
  | { ok: false; error: string };

const COMPANY_ALLOWED = [
  "name",
  "official_email",
  "phone",
  "website_url",
  "vat_no",
  "registration_no",
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
  const mm = maintenanceGuard();
  if (!mm.ok) return { ok: false, error: mm.error };
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return { ok: false, error: "Unauthorized" };
  }
  // ── THE PROFILE THEY ARE ACTING AS, NOT THE OLDEST ONE ──────────────
  //
  // This took `order created_at asc limit 1` and ignored the profile_id
  // cookie that the layout and every other guard use — so somebody with
  // a profile in two tenants got tenant A's row while standing in tenant
  // B's shell.
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  const wanted = cookieStore.get("profile_id")?.value;
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, user_id, tenant_id, is_active, status")
    .eq("user_id", userData.user.id);
  const list = (profiles ?? []) as Array<{
    id: string;
    user_id: string;
    tenant_id: string | null;
    is_active?: boolean | null;
    status?: string | null;
  }>;
  const profile = wanted
    ? list.find((p) => p.id === wanted) ?? list[0]
    : list[0];
  if (!profile?.tenant_id) return { ok: false, error: "Profile missing" };
  // ── AND STILL ACTIVE ────────────────────────────────────────────────
  //
  // This was the only context resolver in the repo with no is_active /
  // status test, so a switched-off advertiser could still reach
  // saveOwnCompanyOnboarding and rewrite the company name, VAT number
  // and billing address that go on every invoice. A deactivated user
  // keeps a valid JWT until it expires; nothing revokes it. Its sibling
  // 200 lines down blocks exactly this and says so.
  if (
    profile.is_active === false ||
    (profile.status ?? "active") === "inactive"
  ) {
    return { ok: false, error: "Account is inactive" };
  }

  // ── AND THE ADVERTISER IN THAT TENANT ───────────────────────────────
  //
  // `.maybeSingle()` on user_id alone ERRORS when somebody has an
  // advertiser row in two tenants, returning null — so "Advertiser
  // missing" for ever, in BOTH tenants. companies is then never written,
  // the billing run finds no company, counts them in skipped_no_company
  // and raises no invoice at all: silently unbillable while their
  // subscription reads active.
  const { data: advertiser } = await supabase
    .from("advertisers")
    .select("id, tenant_id, user_id")
    .eq("user_id", userData.user.id)
    .eq("tenant_id", profile.tenant_id)
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
  // Its sibling updateOwnProfileAndCompany opens with this and this one
  // did not, so MAINTENANCE_MODE=true froze one of the two writes that
  // change the company name, VAT number and billing address -- the
  // three things printed on an invoice.
  {
    const mm = maintenanceGuard();
    if (!mm.ok) return { ok: false, error: mm.error };
  }
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
    const { data: rows, error: updateError } = await supabase
      .from("companies")
      .update(companyClean)
      .eq("id", existing.id)
      .eq("advertiser_id", advertiser.id)
      .select("id");
    if (updateError) return { ok: false, error: updateError.message };
    // Customer-facing: a company or billing address that reported saved and
    // did not save is the customer's problem, and it ends up on an invoice.
    const wrote = wroteSomething(rows);
    if (!wrote.ok) return wrote;
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
    // .select() and check: an UPDATE that matches nothing is not an error
    // in PostgREST, so without this a customer saving their billing address
    // was told it saved when RLS had refused the write.
    const { data: bRows, error: bError } = await supabase
      .from("billings")
      .update(billingClean)
      .eq("id", existingBilling.id)
      .select("id");
    if (bError) return { ok: false, error: bError.message };
    const bWrote = wroteSomething(bRows);
    if (!bWrote.ok) return bWrote;
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
// phone lives on `companies` (sent via companyUpdates), airtable on
// `advertisers` — neither is a user_profiles column, so keep them out
// or the profile update 400s. Only real user_profiles columns here.
const PROFILE_SELF_ALLOWED = [
  "full_name",
  "email",
  "heard_from",
] as const;
type ProfileSelfInput = Partial<
  Record<(typeof PROFILE_SELF_ALLOWED)[number], unknown>
>;

// registration_no was originally an admin-only extra; it is now in
// COMPANY_ALLOWED because /complete-profile's completeness gate
// checks for it and advertisers need to fill it in themselves.
const COMPANY_ADMIN_EXTRA: readonly string[] = [] as const;

export async function updateOwnProfileAndCompany(input: {
  profile?: ProfileSelfInput;
  company?: CompanyInput;
}): Promise<ActionResult> {
  const mm = maintenanceGuard();
  if (!mm.ok) return mm;
  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return { ok: false, error: "Unauthorized" };

  // ── THE ACTIVE PROFILE, NOT THE OLDEST ONE ──────────────────────────
  //
  // This ignored the `profile_id` cookie that every other guard in the
  // app honours and just took the earliest row. One person can hold a
  // profile in more than one tenant — the app is built for it, and
  // resolveOwnedAdvertiser in this same file was explicitly fixed for
  // this very bug, with a comment saying so. So somebody switched to
  // tenant B and saved their company details, and it was written into
  // tenant A's row — and for an admin that row is the one printed on
  // every invoice the tenant issues.
  //
  // AND A DEACTIVATED ACCOUNT COULD STILL WRITE IT. There was no
  // is_active / status test anywhere here, so an admin whose access had
  // just been taken away could still rewrite the company name, VAT number
  // and address that appear on the tenant's invoices.
  const cookieStore = await cookies();
  const activeProfileId = cookieStore.get("profile_id")?.value;
  const { data: profileRows } = await supabase
    .from("user_profiles")
    .select("id, tenant_id, user_id, role, is_active, status")
    .eq("user_id", userData.user.id)
    .order("created_at", { ascending: true });

  // Never .single() and never .maybeSingle(): maybeSingle THROWS on two
  // rows, and two rows is the normal case for these people.
  const profileRow = activeProfileId
    ? profileRows?.find((p) => p.id === activeProfileId) ?? profileRows?.[0]
    : profileRows?.[0];
  if (!profileRow) return { ok: false, error: "Profile missing" };
  if (
    profileRow.is_active === false ||
    (profileRow.status ?? "active") === "inactive"
  ) {
    return { ok: false, error: "Account is inactive" };
  }

  if (input.profile && Object.keys(input.profile).length > 0) {
    const cleaned: Record<string, unknown> = {};
    for (const col of PROFILE_SELF_ALLOWED) {
      if (col in input.profile) cleaned[col] = input.profile[col];
    }
    if (Object.keys(cleaned).length > 0) {
      const { data: rows, error } = await supabase
        .from("user_profiles")
        .update(cleaned)
        .eq("id", profileRow.id)
        .eq("user_id", userData.user.id)
        .select("id");
      if (error) return { ok: false, error: error.message };
      const wrote = wroteSomething(rows);
      if (!wrote.ok) return wrote;
    }
  }

  if (input.company && Object.keys(input.company).length > 0) {
    const cleaned: Record<string, unknown> = {};
    for (const col of COMPANY_ALLOWED) {
      if (col in input.company) cleaned[col] = input.company[col];
    }
    // COMPANY_ADMIN_EXTRA is now empty — the fields it used to hold
    // are folded into COMPANY_ALLOWED. Left as an extension point.
    for (const col of COMPANY_ADMIN_EXTRA) {
      if (col in (input.company as Record<string, unknown>)) {
        cleaned[col] = (input.company as Record<string, unknown>)[col];
      }
    }
    cleaned.tenant_id = profileRow.tenant_id;
    cleaned.user_profile_id = profileRow.id;

    if (profileRow.role === "admin") {
      // Admin manages the tenant-level company row (advertiser_id NULL,
      // one per tenant). This is what shows up on issued invoices.
      cleaned.advertiser_id = null;
      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .eq("tenant_id", profileRow.tenant_id)
        .is("advertiser_id", null)
        .maybeSingle();
      if (existing?.id) {
        const { data: rows, error } = await supabase
          .from("companies")
          .update(cleaned)
          .eq("id", existing.id)
          .eq("tenant_id", profileRow.tenant_id)
          .is("advertiser_id", null)
          .select("id");
        if (error) return { ok: false, error: error.message };
        const wrote = wroteSomething(rows);
        if (!wrote.ok) return wrote;
      } else {
        const { error } = await supabase.from("companies").insert(cleaned);
        if (error) return { ok: false, error: error.message };
      }
    } else {
      // .eq("tenant_id", ...) is not optional: a person can hold a
      // profile in more than one tenant, maybeSingle() ERRORS on two
      // rows and returns null data, and the line below then answers
      // "Advertiser missing" for ever. The same bug was found and fixed
      // 230 lines up in this file; the second copy was missed.
      const { data: adv } = await supabase
        .from("advertisers")
        .select("id, tenant_id")
        .eq("user_id", userData.user.id)
        .eq("tenant_id", profileRow.tenant_id)
        .maybeSingle();
      if (!adv) return { ok: false, error: "Advertiser missing" };
      if (adv.tenant_id !== profileRow.tenant_id) {
        return { ok: false, error: "Forbidden" };
      }
      cleaned.advertiser_id = adv.id;

      const { data: existing } = await supabase
        .from("companies")
        .select("id")
        .eq("advertiser_id", adv.id)
        .maybeSingle();
      if (existing?.id) {
        const { data: rows, error } = await supabase
          .from("companies")
          .update(cleaned)
          .eq("id", existing.id)
          .eq("advertiser_id", adv.id)
          .select("id");
        if (error) return { ok: false, error: error.message };
        const wrote = wroteSomething(rows);
        if (!wrote.ok) return wrote;
      } else {
        const { error } = await supabase.from("companies").insert(cleaned);
        if (error) return { ok: false, error: error.message };
      }
    }
  }

  return { ok: true, data: null };
}
