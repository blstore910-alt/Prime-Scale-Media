import AffiliateApp from "@/components/affiliate/aff-app";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("role")
    .eq("user_id", user?.user?.id)
    .single();

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
  // them there rather than rendering a shell-less page here.
  redirect("/dashboard");
}
