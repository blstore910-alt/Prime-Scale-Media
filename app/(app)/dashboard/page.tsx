import AdminDashboard from "@/components/admin/dashboard";
import AdvertiserDashboard from "@/components/advertiser/dashboard";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";

export default async function DashboardPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data } = await supabase.auth.getUser();
  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("user_id", data.user?.id);

  const profile = existingProfile
    ? profiles?.find((p) => p.id === existingProfile)
    : profiles?.[0];

  const role = profile?.role;

  if (role === "advertiser") {
    return <AdvertiserDashboard />;
  }

  return <AdminDashboard />;
}
