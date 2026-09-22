"use server";

import { headers } from "next/headers";
import { callerIp, LIMITS, rateLimitCheck } from "@/lib/rate-limit";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { finalizeSignup, signupMetadata } from "@/lib/auth/finalize-signup";

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
  cookieStore.set("profile_id", profileId, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
  });
  revalidatePath(pathname);

  return true;
}

export async function loginUser(formData: FormData) {
  const email = formData.get("email") as string;
  const password = formData.get("password") as string;

  // ── SIGNING IN HAD NO RATE LIMIT ────────────────────────────────────
  //
  // A server action is a public POST endpoint — the middleware is not an
  // authorization boundary for one, because the action is posted to
  // whatever path the page happens to be on. So this passed FormData
  // straight into signInWithPassword with nothing in front of it, and
  // eight other endpoints in this app have a bucket while the one that
  // takes a password did not.
  //
  // Per IP, because a guessing run varies the email. A failure to READ
  // the limit is not a reason to refuse somebody their own account, so
  // this errs open on an unreachable limiter — the same choice the
  // signup and invite paths make.
  const hdrs = await headers();
  const allowed = await rateLimitCheck(
    LIMITS.login,
    `ip:${callerIp({ headers: hdrs })}`,
  );
  if (!allowed) {
    return {
      error:
        "Too many sign-in attempts from this connection. Wait a few minutes and try again.",
    };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    return { error: error.message };
  }

  let { data: profiles } = await supabase
    .from("user_profiles")
    .select("id, role")
    .eq("user_id", data.user.id);

  // ── A CONFIRMED SIGN-UP WITH NO ACCOUNT YET: FINISH IT NOW ──────────
  // The confirmation link is where a self-signup gets its profile, wallet
  // and referral. When that link reached us without a code -- a mail
  // scanner opened it first, a second click, another browser -- the
  // address was confirmed but nothing was made, and this sign-in sent the
  // person to "create an organisation". A successful sign-in means the
  // address is confirmed, so the account is finished here instead.
  if (!profiles?.length) {
    const meta = signupMetadata(data.user);
    if (meta.tenantSlug && data.user.email) {
      const done = await finalizeSignup({
        user: { id: data.user.id, email: data.user.email, user_metadata: data.user.user_metadata },
        tenantSlug: meta.tenantSlug,
        referralCode: meta.referralCode,
        signupReferralCode: meta.referralCode,
      });
      if (done.ok) {
        const again = await supabase
          .from("user_profiles")
          .select("id, role")
          .eq("user_id", data.user.id);
        profiles = again.data;
      }
    }
  }

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
      cookieStore.set("profile_id", newProfileObj.id, {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
      });
    }
  }

  const isVerified = data.user?.user_metadata?.email_verified;

  // Return the destination instead of redirecting server-side, so the client
  // can let the sign-in launch animation finish before navigating. The cookie
  // set above is still applied on this action's response.
  return { redirectTo: isVerified ? "/dashboard" : "/auth/sign-up-success" };
}
