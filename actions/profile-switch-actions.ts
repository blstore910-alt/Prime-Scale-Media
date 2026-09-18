"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Switch which of the caller's own profiles is active, then go there.
 *
 * WHY THIS EXISTS. One person can hold a profile in more than one tenant
 * — the app is built for it, several guards say so in their own comments,
 * and a redirect loop was fixed for exactly those people. The active one
 * is chosen by the `profile_id` cookie, which until now was only ever
 * written by the two accept-invite routes. There was no way to change it
 * afterwards.
 *
 * The expired-invite card looked like the way: it renders one card per
 * organization, linking to /organization/<id>. There is no [id] segment
 * under app/organization, so every one of those cards was a 404 — and
 * with no not-found page, an unstyled one with no route back.
 *
 * WHAT MAKES IT SAFE. The profile id is re-checked against the SESSION,
 * not trusted: `user_id = auth.getUser()`. So the cookie can only ever be
 * set to a profile the caller actually holds. That matters because every
 * admin guard in the app reads this cookie to decide which tenant the
 * caller is acting in — writing an arbitrary id into it would be a
 * tenant-hop.
 */
export async function switchToProfile(formData: FormData): Promise<void> {
  const profileId = String(formData.get("profile_id") ?? "");
  if (!profileId) redirect("/dashboard");

  const supabase = await createClient();
  const { data: userData } = await supabase.auth.getUser();
  if (!userData?.user) redirect("/auth/login");

  // Theirs, and still active. A deactivated profile is not somewhere to
  // send anybody: the (app) layout would bounce them straight to
  // /inactive, which reads as the switch having failed.
  const { data: rows } = await supabase
    .from("user_profiles")
    .select("id, is_active, status")
    .eq("user_id", userData.user.id)
    .eq("id", profileId);

  const profile = rows?.[0];
  if (!profile) redirect("/dashboard");
  if (
    profile.is_active === false ||
    (profile.status ?? "active") === "inactive"
  ) {
    redirect("/inactive");
  }

  const jar = await cookies();
  jar.set("profile_id", profile.id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });

  redirect("/dashboard");
}
