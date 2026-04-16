import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

type ProfileRecord = {
  id: string;
  role: string;
  tenant_id: string | null;
  user_id: string;
};

type TenantRecord = {
  owner_id: string | null;
};

export async function requireSuperAdmin(redirectTo = "/dashboard") {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    redirect("/auth/login");
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
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

  if (!profile?.tenant_id || profile.role !== "admin") {
    redirect(redirectTo);
  }

  const { data: tenant, error: tenantError } = await supabase
    .from("tenants")
    .select("owner_id")
    .eq("id", profile.tenant_id)
    .maybeSingle();

  if (tenantError) {
    throw new Error(tenantError.message);
  }

  const ownerId = (tenant as TenantRecord | null)?.owner_id;
  const authUserId = userData.user.id;
  const profileUserId = profile.user_id;

  const isSuperAdmin =
    !!ownerId && (ownerId === authUserId || ownerId === profileUserId);

  if (!isSuperAdmin) {
    redirect(redirectTo);
  }

  return { user: userData.user, profile };
}
