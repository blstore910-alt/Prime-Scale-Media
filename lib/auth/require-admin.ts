import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type ProfileRecord = {
  id: string;
  role: string;
};

export async function requireAdmin(redirectTo = "/dashboard") {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/auth/login");
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, role, is_active, status")
    .eq("user_id", userData.user.id);

  if (profileError) {
    throw new Error(profileError.message);
  }

  const profileList = (profiles ?? []) as ProfileRecord[];
  if (!profileList.length) {
    redirect("/onboard");
  }

  const profile = existingProfile
    ? profileList.find((item) => item.id === existingProfile) ?? profileList[0]
    : profileList[0];

  if (profile.role !== "admin") {
    redirect(redirectTo);
  }
  // Deactivated admins keep their role but lose access.
  const p = profile as ProfileRecord & {
    is_active?: boolean;
    status?: string;
  };
  if (p.is_active === false || (p.status ?? "active") === "inactive") {
    redirect("/inactive");
  }

  return { user: userData.user, profile };
}
