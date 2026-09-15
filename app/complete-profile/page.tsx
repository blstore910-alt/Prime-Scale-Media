import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
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

  // .single() here was a lockout. A user can legitimately hold more than one
  // user_profiles row — accept-invite dedupes on (user_id, tenant_id), so
  // being an affiliate in one tenant and an advertiser in another produces
  // two — and .single() turns "more than one row" into an ERROR with null
  // data, not into a choice. profile was then null, this redirected to "/",
  // and "/" sent an advertiser without a company straight back here. A loop
  // with no way out except clearing cookies.
  //
  // So: read them all and honour the active profile_id cookie, which is what
  // every other guard in the app does.
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("*, advertiser:advertisers(*)")
    .eq("user_id", user.id);

  const profileList = (profiles ?? []) as UserProfile[];
  if (!profileList.length) {
    redirect("/onboard");
  }

  // Prefer the profile the session is actually acting as; failing that, an
  // advertiser profile, since this page exists only for advertisers.
  const profile =
    (existingProfile
      ? profileList.find((p) => (p as { id: string }).id === existingProfile)
      : undefined) ??
    profileList.find((p) => p.role === "advertiser") ??
    profileList[0];

  if (profile.role !== "advertiser") {
    redirect("/dashboard");
  }

  // The embed comes back as an array or a single row depending on the
  // relationship shape; narrow it explicitly so the type is honest.
  const advertiser = Array.isArray(profile.advertiser)
    ? profile.advertiser[0]
    : profile.advertiser;

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

  const displayName =
    profile.full_name ||
    user.user_metadata?.display_name ||
    `${user.user_metadata?.first_name ?? ""} ${
      user.user_metadata?.last_name ?? ""
    }`.trim() ||
    user.email ||
    "Unknown user";
  const userEmail = user.email ?? profile.email ?? "No email";
  const roleLabel = profile.role
    ? profile.role.charAt(0).toUpperCase() + profile.role.slice(1)
    : "User";
  const joinedDate = user.created_at
    ? new Date(user.created_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : null;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <div className="w-full px-8 py-4 border-b bg-muted/20 flex items-center justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate">
            Signed in as {displayName}
          </p>
          <p className="text-xs text-muted-foreground truncate">
            {userEmail}
            {joinedDate ? ` | Joined ${joinedDate}` : ""}
            {roleLabel ? ` | ${roleLabel}` : ""}
          </p>
        </div>
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
