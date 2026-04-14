"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";

export async function changeProfile(profileId: string, pathname: string) {
  const cookieStore = await cookies();

  cookieStore.set("profile_id", profileId);
  revalidatePath(pathname);

  return true;
}

import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

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
    let newProfile;
    if (profileCookie) {
      newProfile =
        profiles.find((p) => p.id === profileCookie)?.id || profiles[0].id;
    }
    if (newProfile) {
      cookieStore.set("profile_id", newProfile);
      cookieStore.set("role", newProfile.role);
    }
  }

  const isVerified = data.user?.user_metadata?.email_verified;

  if (isVerified) {
    redirect("/dashboard");
  } else {
    redirect("/auth/sign-up-success");
  }
}
