import { getSessionProfiles, getSessionUser } from "@/lib/auth/session";
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

/**
 * ⚠️ DEACTIVATED KEEPS THE ROLE AND LOSES THE ACCESS.
 *
 * This guard tested ownership and nothing else, while require-admin.ts
 * eight lines away tests is_active and status, and apiRequireAdmin does
 * too. So a deactivated OWNER kept /audit, /reconciliation, /commissions,
 * /activity-logs, /invites, /admins, /affiliates and all of /settings —
 * every write was refused downstream, and the reads were not. The audit
 * log and the books are exactly what you take away first.
 */
export async function requireSuperAdmin(redirectTo = "/dashboard") {
  // Cached per render, so this is free when the (app) layout already ran it.
  // See lib/auth/session.ts.
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

  if (!profile?.tenant_id || profile.role !== "admin") {
    redirect(redirectTo);
  }

  // The check this guard did not have. See the note on the function.
  if (
    (profile as { is_active?: boolean | null }).is_active === false ||
    ((profile as { status?: string | null }).status ?? "active") === "inactive"
  ) {
    redirect("/inactive");
  }

  const supabase = await createClient();
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
