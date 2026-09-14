import { getSessionProfiles, getSessionUser } from "@/lib/auth/session";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type ProfileRecord = {
  id: string;
  role: string;
};

export async function requireAdmin(redirectTo = "/dashboard") {
  // These two go through React cache(), so when the (app) layout has already
  // fetched them for this same render they cost nothing. Before, every page
  // repeated the layout's auth.getUser() and profile query — four sequential
  // Supabase round trips per navigation, ~475ms of the ~700ms server render.
  // Same checks, same freshness; just not asked twice.
  const { data: userData, error: userError } = await getSessionUser();

  if (userError || !userData.user) {
    redirect("/auth/login");
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: profiles, error: profileError } = await getSessionProfiles(
    userData.user.id,
  );

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
