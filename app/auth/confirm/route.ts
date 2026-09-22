import { createClient } from "@/lib/supabase/server";
import { type EmailOtpType, type User } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { finalizeSignup, type ConfirmedUser } from "@/lib/auth/finalize-signup";

function redirectWithError(request: NextRequest, message: string) {
  return NextResponse.redirect(
    new URL(`/auth/error?error=${encodeURIComponent(message)}`, request.url),
  );
}

function getStringMetadataValue(
  metadata: Record<string, unknown>,
  key: string,
): string | null {
  const value = metadata[key];
  if (typeof value !== "string") {
    return null;
  }
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : null;
}

function toConfirmedUser(user: User | null | undefined): ConfirmedUser | null {
  if (!user?.id || !user.email) {
    return null;
  }
  return {
    id: user.id,
    email: user.email,
    user_metadata: user.user_metadata,
  };
}

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const supabase = await createClient();
  let user: ConfirmedUser | null = null;

  // Supabase sends the person here WITH the reason when the link is used
  // up or too old (otp_expired, access_denied). Say that, instead of
  // "no token provided".
  const linkError = searchParams.get("error_code") ?? searchParams.get("error");
  if (linkError && !tokenHash && !code) {
    return redirectWithError(request, "No confirmation token provided");
  }

  if (tokenHash && type) {
    const { data: otpData, error: verifyOtpError } =
      await supabase.auth.verifyOtp({
        type,
        token_hash: tokenHash,
      });
    if (verifyOtpError) {
      return redirectWithError(request, verifyOtpError.message);
    }
    user = toConfirmedUser(otpData.user ?? otpData.session?.user);
  } else if (code) {
    const { data: sessionData, error: exchangeError } =
      await supabase.auth.exchangeCodeForSession(code);
    if (exchangeError) {
      return redirectWithError(request, exchangeError.message);
    }
    user = toConfirmedUser(sessionData?.user ?? sessionData?.session?.user);
  } else {
    return redirectWithError(request, "No confirmation token provided");
  }

  if (!user) {
    return redirectWithError(request, "Invalid session data");
  }

  const metadata = (user.user_metadata as Record<string, unknown> | null) ?? {};

  // Prefer the tenant/referral values recorded in the user's metadata (set at
  // signup time by the app's own signup flow) over URL query params. If both
  // are present and they diverge, refuse — the URL was tampered with.
  const metadataTenant = getStringMetadataValue(metadata, "tenant_slug");
  const urlTenant = searchParams.get("t");
  if (metadataTenant && urlTenant && metadataTenant !== urlTenant) {
    return redirectWithError(request, "Tenant slug mismatch");
  }
  // ── AND A SILENT METADATA IS NOT PERMISSION TO TRUST THE URL ────────
  //
  // The mismatch refusal above only fires when BOTH are present. Users
  // minted by auth.admin.createUser — the invite-signup route and the
  // admin-create route — carry no tenant_slug metadata at all, so such a
  // user with no profile yet, confirming with ?t=<any slug>, got a
  // service-role user_profiles insert as an ADVERTISER in a tenant they
  // chose from the address bar.
  //
  // The URL is only trusted when the app has no opinion AND the user has
  // no profile to contradict it, which is the genuine self-signup case
  // this fallback was written for — and that flow always sets the
  // metadata, so in practice the fallback now serves nobody but a
  // legacy link.
  // `metadata` is `(...) ?? {}`, so it was ALWAYS truthy and the
  // right-hand branch never ran. That is the behaviour this comment
  // argues for, so it is written as what it does: the URL is not
  // trusted, full stop. `urlTenant` is still read above, to refuse a
  // mismatch.
  void urlTenant;
  const tenantSlug = metadataTenant ?? null;

  const metadataReferral = getStringMetadataValue(metadata, "referral_code");
  const urlReferral = searchParams.get("ref");
  if (metadataReferral && urlReferral && metadataReferral !== urlReferral) {
    return redirectWithError(request, "Referral code mismatch");
  }
  const referralCode = (metadataReferral ?? urlReferral)?.toUpperCase() ?? null;

  // ── ONLY THE SIGNUP FAMILY GETS THE SIGNUP FINALISER ──────────────
  //
  // This ran unconditionally for every OTP type. A password `recovery`,
  // an `email_change` or a `magiclink` routed through here therefore
  // went looking for a tenant slug it could not have and ended on
  // /auth/error -- on the screen somebody reaches when they already
  // cannot get in.
  //
  // `next` is honoured where the link carries one, which is how
  // Supabase's own templates point a recovery link at
  // /auth/update-password.
  const nextParam = searchParams.get("next");
  const safeNext =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : null;
  // `email` is what Supabase's own confirmation template sends for a
  // SIGN-UP now (token_hash + type=email). It was missing, so a new
  // customer who confirmed was sent to /dashboard with no profile, no
  // wallet and no referral -- and from there to "create an organisation".
  const isSignupFamily =
    !type || type === "signup" || type === "invite" || type === "email";
  if (!isSignupFamily) {
    return NextResponse.redirect(
      new URL(
        safeNext ?? (type === "recovery" ? "/auth/update-password" : "/dashboard"),
        request.url,
      ),
    );
  }

  const result = await finalizeSignup({
    user,
    tenantSlug,
    referralCode,
    signupReferralCode: metadataReferral?.toUpperCase() ?? null,
  });
  return result.ok
    ? NextResponse.redirect(new URL(result.path, request.url))
    : redirectWithError(request, result.error);
}
