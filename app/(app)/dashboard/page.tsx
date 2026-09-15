import AdminDashboard from "@/components/admin/dashboard";
import AdvertiserDashboard from "@/components/advertiser/dashboard";
import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    redirect("/auth/login");
  }

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("user_id", data.user.id);

  // `?? profiles?.[0]` matches every other guard in the app. Without it, a
  // profile_id cookie left behind by a PREVIOUS user of the same browser
  // (it is httpOnly, so signing out in the client could not clear it)
  // resolved to undefined here.
  const profile = existingProfile
    ? profiles?.find((p) => p.id === existingProfile) ?? profiles?.[0]
    : profiles?.[0];

  const role = profile?.role;

  if (role === "advertiser") {
    return <AdvertiserDashboard />;
  }

  // Affiliates have no admin overview; their home is the referrals jackpot.
  if (role === "affiliate") {
    redirect("/my-referrals");
  }

  // Explicit, and deliberately not a fallback. This used to `return
  // <AdminDashboard />` for ANY role it could not identify — including
  // undefined — so an unresolved profile landed on the most privileged
  // screen in the app. An unknown role is a reason to send someone away,
  // never a reason to promote them.
  if (role === "admin") {
    return <AdminDashboard />;
  }

  redirect(profiles?.length ? "/onboard" : "/auth/login");
}
