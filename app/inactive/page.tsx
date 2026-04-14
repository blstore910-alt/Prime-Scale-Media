import { createClient } from "@/lib/supabase/server";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import InactiveContent from "@/components/inactive/inactive-content";

export default async function InactivePage() {
  const supabase = await createClient();
  const cookieStore = await cookies();
  const existingProfile = cookieStore.get("profile_id")?.value;

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    redirect("/auth/login");
  }

  const { data: profiles, error: profileError } = await supabase
    .from("user_profiles")
    .select("*, tenant:tenants(*), advertiser:advertisers(*)")
    .eq("user_id", user.id);

  if (profileError || !profiles || !profiles.length) {
    redirect("/onboard");
  }

  const profile = existingProfile
    ? profiles?.find((p) => p.id === existingProfile)
    : profiles[0];

  return <InactiveContent user={user} profile={profile} />;
}
