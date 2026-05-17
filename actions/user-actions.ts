"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export async function changeProfile(profileId: string, pathname: string) {
  const supabase = await createClient();
  const { data: userData, error } = await supabase.auth.getUser();

  if (error || !userData.user) {
    return false;
  }

  // Verify profileId belongs to current user
  const { data: profile } = await supabase
    .from("user_profiles")
    .select("id")
    .eq("id", profileId)
    .eq("user_id", userData.user.id)
    .maybeSingle();

  if (!profile) {
    return false;
  }

  const cookieStore = await cookies();
  cookieStore.set("profile_id", profileId);
  revalidatePath(pathname);

  return true;
}

export async function loginUser(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    console.log(error);
    return { error: error.message };
  }

  const { data: profiles } = await supabase
    .from("user_profiles")
    .select("*")
    .eq("user_id", data.user.id);

  const cookieStore = await cookies();

  const profileCookie = cookieStore.get("profile_id");

  if (profiles?.length) {
    let newProfileId: string;
    if (profileCookie) {
      newProfileId =
        profiles.find((p) => p.id === profileCookie.value)?.id || profiles[0].id;
    } else {
      newProfileId = profiles[0].id;
    }
    const newProfileObj = profiles.find((p) => p.id === newProfileId);
    if (newProfileObj) {
      cookieStore.set("profile_id", newProfileObj.id);
      cookieStore.set("role", newProfileObj.role);
    }
  }

  const isVerified = data.user?.user_metadata?.email_verified;

  if (isVerified) {
    redirect("/dashboard");
  } else {
    redirect("/auth/sign-up-success");
  }
}
