import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export async function apiRequireAdmin() {
  const supabase = await createClient();
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData.user) {
    return {
      error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
      profile: null,
      user: null,
    };
  }

  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("id, role, tenant_id, user_id")
    .eq("user_id", userData.user.id);

  if (profileError || !profiles?.length) {
    return {
      error: NextResponse.json({ error: "Profile not found" }, { status: 403 }),
      profile: null,
      user: null,
    };
  }

  const profile = existingProfile
    ? profiles.find((p) => p.id === existingProfile) ?? profiles[0]
    : profiles[0];

  if (profile.role !== "admin" || !profile.tenant_id) {
    return {
      error: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
      profile: null,
      user: null,
    };
  }

  return { error: null, profile, user: userData.user };
}
