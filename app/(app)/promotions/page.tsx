import PromotionsManager from "@/components/promotions/promotions-manager";
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

  if (profile?.role !== "admin") redirect("/");

  return (
    <div className="py-8 px-4 sm:px-6 lg:px-8 space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Promotions</h2>
        <p className="text-sm text-muted-foreground">
          Grant advertisers free ad-account requests, waive or discount their
          subscription, and manage active perks.
        </p>
      </div>
      <PromotionsManager />
    </div>
  );
}
