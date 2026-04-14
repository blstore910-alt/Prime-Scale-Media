import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import CompanyOnboardingForm from "@/components/company/company-onboarding-form";
import { UserProfile } from "@/lib/types/user";
import { LogoutButton } from "@/components/auth/logout-button";

export default async function CompleteProfilePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*, advertiser:advertisers(*)")
    .eq("user_id", user.id)
    .single();

  if (!profile) {
    redirect("/");
  }

  if (profile.role !== "advertiser") {
    redirect("/");
  }

  const advertiser = profile.advertiser?.[0] || profile.advertiser;

  if (!advertiser) {
    return <div>Error loading advertiser profile.</div>;
  }

  // Fetch company with billings
  const { data: company } = await supabase
    .from("companies")
    .select("*, billings(*)")
    .eq("advertiser_id", advertiser.id)
    .maybeSingle();

  if (company) {
    const isCompanyComplete =
      company.name &&
      company.official_email &&
      company.phone &&
      company.address &&
      company.country &&
      company.state &&
      company.zipcode &&
      company.registration_no;

    const billing = company.billings?.[0];
    const isBillingComplete =
      billing &&
      billing.address &&
      billing.state &&
      billing.country &&
      billing.zipcode;

    const isVatComplete = !!company?.vat_no || company?.is_not_vat === true;

    if (isCompanyComplete && isVatComplete && isBillingComplete) {
      redirect("/");
    }
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="h-20 flex justify-end items-center w-full px-8">
        <LogoutButton />
      </div>

      <div className="flex-1 bg-background flex items-center justify-center">
        <CompanyOnboardingForm
          profile={profile as UserProfile}
          advertiserId={advertiser.id}
        />
      </div>
    </div>
  );
}
