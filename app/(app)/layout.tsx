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

  if (profile.status === "inactive") {
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


      if (!isCompanyComplete || !isVatComplete || !isBillingComplete) {
        redirect("/complete-profile");
      }
    }
  }

  const Layout = ROLE_LAYOUTS[profile.role as UserRole] || React.Fragment;

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
