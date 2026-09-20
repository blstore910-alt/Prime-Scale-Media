import AdminLayout from "@/components/admin/layout";
import AppVersionBanner from "@/components/app-version-banner";
import ErrorBoundary from "@/components/error-boundary";
import Heartbeat from "@/components/heartbeat";
import IdleTimeoutManager from "@/components/idle-timeout-manager";
import MaintenanceBanner from "@/components/maintenance-banner";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfiles, getSessionUser } from "@/lib/auth/session";
import { redirect } from "next/navigation";
import React from "react";

import AdvertiserLayout from "@/components/advertiser/layout";
import AffiliateLayout from "@/components/affiliate/layout";
import { UserRole } from "@/lib/types/user";
import { cookies } from "next/headers";

// Every real role MUST map to a layout that provides QueryClientProvider +
// AppProvider. A missing role fell through to React.Fragment, which renders
// pages with NO providers → any react-query hook throws "No QueryClient
// set" (this is exactly what broke the affiliate area after signup).
const ROLE_LAYOUTS = {
  admin: AdminLayout,
  advertiser: AdvertiserLayout,
  affiliate: AffiliateLayout,
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  // Shared with the page's own requireAdmin() through React cache(), so the
  // session and profile are fetched once per navigation instead of twice.
  // See lib/auth/session.ts for the measurement that prompted it.
  const { data, error: userError } = await getSessionUser();
  const { data: profiles, error: profileError } = await getSessionProfiles(
    data.user?.id ?? "",
  );

  if (userError || profileError)
    throw new Error(userError?.message || profileError?.message);

  if (!profiles.length) redirect("/onboard");

  // Cookie can point at a profile the user no longer owns (deleted,
  // rotated tenant, etc). Fall back to the first available profile
  // instead of crashing on `profile.status`.
  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (!profile) redirect("/onboard");

  // ── is_active AS WELL, AND ANY STATUS THAT IS NOT ACTIVE ──────────
  //
  // This tested `status` and only the literal "inactive". Every other
  // guard in the app tests both columns -- requireAdmin,
  // requireSuperAdmin, apiRequireAdmin, resolveAdminContext, the
  // invoice PDF route, the push route. This one did not, and it is the
  // only lockout the CUSTOMER shells have: an advertiser or affiliate
  // never passes through requireAdmin.
  //
  // Two ways into the gap. requestOwnErasure writes
  // status: "pending_erasure", is_active: false -- so somebody who
  // asked to be deleted kept their whole dashboard. And
  // updateUserProfile allowlists is_active and status as SEPARATE
  // columns, so an admin can clear is_active and leave status alone.
  //
  // Writes were already refused, so this was retained READ access --
  // wallet balance, ad accounts, invoices, the financial report. For an
  // erasure request that is still the wrong answer.
  //
  // NAMED VALUES, NOT "anything that is not active". The first draft of
  // this locked out every status except "active" -- and neither
  // accept-invite route sets `status` at all, so a new customer's value
  // is whatever the column default is, and no `create table` for
  // user_profiles exists in this repo to read it from. If that default
  // is any word other than NULL or "active", that version locks out
  // every single person who accepts an invitation, on a live app.
  //
  // The downside of being wrong in the other direction is smaller and
  // recoverable: a status somebody adds later would not lock its holder
  // out until this list is extended. The downside of being wrong in the
  // strict direction is that nobody can sign up.
  const lockedStatus = ["inactive", "disabled", "suspended", "pending_erasure"];
  if (
    profile.is_active === false ||
    lockedStatus.includes(String(profile.status ?? "").toLowerCase())
  ) {
    redirect("/inactive");
  }

  // Check Company Status for Advertisers - redirect to complete-profile if no company/VAT
  if (profile.role === "advertiser") {
    const advertiser = profile.advertiser
      ? Array.isArray(profile.advertiser)
        ? profile.advertiser[0]
        : profile.advertiser
      : null;

    if (advertiser) {
      const supabase = await createClient();
      const { data: company } = await supabase
        .from("companies")
        .select("*, billings(*)")
        .eq("advertiser_id", advertiser.id)
        .maybeSingle();

      const isCompanyComplete = Boolean(
        company &&
          company.name &&
          company.official_email &&
          company.phone &&
          company.address &&
          company.country &&
          company.state &&
          company.zipcode,
      );

      const billing = company?.billings?.[0];
      const isBillingComplete = Boolean(
        billing &&
          billing.address &&
          billing.state &&
          billing.country &&
          billing.zipcode,
      );

      const isVatComplete = !!company?.vat_no || company?.is_not_vat === true;


      // NOT a redirect any more. Someone who has just signed up should be
      // able to look around — see what a wallet is, what an ad account is,
      // what they are paying for — before being asked for a VAT number and a
      // billing address. Being met by a long form the second you arrive is
      // how a new customer decides to finish it later, or not at all.
      //
      // The requirement itself stands: nothing that costs money or creates
      // work can be done until the details are there, because an invoice
      // cannot be raised without them. That gate lives at each action and on
      // the dashboard's own checklist, where it can say WHY. Browsing costs
      // nothing, so browsing is allowed.
      void isCompanyComplete;
      void isVatComplete;
      void isBillingComplete;
    }
  }

  // No Fragment fallback. The comment above records what it cost: a role
  // outside the three known ones rendered every page with NO providers,
  // so the first react-query hook threw "No QueryClient set" into the
  // error boundary — which is what broke the affiliate area after signup.
  // /dashboard already redirects in this case; the rest of the group did
  // not. Send them where the role gets decided.
  const Layout = ROLE_LAYOUTS[profile.role as UserRole];
  if (!Layout) redirect("/onboard");

  return (
    <Layout user={data.user} profile={profile}>
      <MaintenanceBanner />
      <ErrorBoundary>{children}</ErrorBoundary>
      <AppVersionBanner />
      <Heartbeat />
      <IdleTimeoutManager />
    </Layout>
  );
}
