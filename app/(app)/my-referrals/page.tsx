import AffiliateApp from "@/components/affiliate/aff-app";
import { resolveActiveProfile } from "@/lib/active-profile";
import { redirect } from "next/navigation";

export default async function Page() {
  // The LIST plus the profile_id cookie, never .single() — a person with
  // both an advertiser and an affiliate profile made .single() error, and
  // the redirect below then bounced them between "/" and /dashboard until
  // the browser gave up. See lib/active-profile.ts.
  const { profile } = await resolveActiveProfile();

  // Both the standalone affiliate role and an advertiser acting as an
  // affiliate (approved referral link) see referrals here.
  const allowed =
    profile?.role === "advertiser" || profile?.role === "affiliate";
  if (!allowed) redirect("/");

  // Standalone affiliates get the full single-page affiliate app.
  if (profile?.role === "affiliate") {
    return <AffiliateApp />;
  }

  // Advertisers-as-affiliate see referrals as the "Affiliate program" view
  // inside their own single-page advertiser shell (at /dashboard), so send
  // them there rather than rendering a shell-less page here — and name the
  // view, or they arrive on the Dashboard having asked for referrals.
  redirect("/dashboard?view=referrals");
}
