import AffiliateDashboard from "@/components/affiliate/affiliate-dashboard";
import ReferralLinkBox from "@/components/affiliate/referral-link-box";
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
  // affiliate (approved referral link) see this dashboard.
  const allowed = profile?.role === "advertiser" || profile?.role === "affiliate";
  if (!allowed) redirect("/");

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-6 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">
              My Referrals
            </h2>
            <p className="text-sm text-muted-foreground">
              Track the advertisers you referred, their spend, and your
              earnings.
            </p>
          </div>

          <ReferralLinkBox />
          <AffiliateDashboard />
        </div>
      </div>
    </div>
  );
}
