import MySubscriptionView from "@/components/subscriptions/my-subscription-view";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function Page() {
  const supabase = await createClient();
  const { data: user } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("*, advertiser:advertisers(*)")
    .eq("user_id", user?.user?.id)
    .single();

  if (!profile) {
    redirect("/onboard");
  }

  if (profile.role !== "advertiser") {
    redirect("/subscriptions");
  }

  return (
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6 px-4 lg:px-6">
          <MySubscriptionView />
        </div>
      </div>
    </div>
  );
}
