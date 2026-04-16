import AdminLayout from "@/components/admin/layout";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import React from "react";

import AdvertiserLayout from "@/components/advertiser/layout";
import { UserRole } from "@/lib/types/user";
import { cookies } from "next/headers";
import PWAInstallPrompt from "@/components/pwa-install-prompt";

const ROLE_LAYOUTS = {
  admin: AdminLayout,
  advertiser: AdvertiserLayout,
};

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data, error: userError } = await supabase.auth.getUser();
  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("*, tenant:tenants(*), advertiser:advertisers(*)")
    .eq("user_id", data.user?.id);

  if (userError || profileError)
    throw new Error(userError?.message || profileError?.message);

  if (!profiles.length) redirect("/onboard");

  const profile = existingProfile
    ? profiles?.find((p) => p.id === existingProfile)
    : profiles[0];

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
      const { data: company } = await supabase
        .from("companies")
        .select("*, billings(*)")
        .eq("advertiser_id", advertiser.id)
        .maybeSingle();

      const isCompanyComplete =
        company &&
        company.name &&
        company.official_email &&
        company.phone &&
        company.address &&
        company.country &&
        company.state &&
        company.zipcode &&
        company.registration_no;

      const billing = company?.billings?.[0];
      const isBillingComplete =
        billing &&
        billing.address &&
        billing.state &&
        billing.country &&
        billing.zipcode;

      const isVatComplete = !!company?.vat_no || company?.is_not_vat === true;

      if (!isCompanyComplete || !isVatComplete || !isBillingComplete) {
        redirect("/complete-profile");
      }
    }
  }

  const Layout = ROLE_LAYOUTS[profile.role as UserRole] || React.Fragment;

  return (
    <Layout user={data.user} profile={profile}>
      {children}
    </Layout>
  );
}
